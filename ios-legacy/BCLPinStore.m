#import "BCLPinStore.h"
#import <CommonCrypto/CommonKeyDerivation.h>
#import <Security/Security.h>
#import <stdint.h>

static NSString *const BCLPinService = @"com.enscvs.borsaci.legacy.pin";
static NSString *const BCLPinAccount = @"application-pin";
static const NSUInteger BCLSaltLength = 16;
static const NSUInteger BCLHashLength = 32;
static const uint32_t BCLPBKDFRounds = 30000;

@implementation BCLPinStore

+ (instancetype)sharedStore {
	static BCLPinStore *store;
	static dispatch_once_t onceToken;
	dispatch_once(&onceToken, ^{
		store = [[BCLPinStore alloc] init];
	});
	return store;
}

- (NSMutableDictionary *)baseQuery {
	return [@{
		(__bridge id)kSecClass: (__bridge id)kSecClassGenericPassword,
		(__bridge id)kSecAttrService: BCLPinService,
		(__bridge id)kSecAttrAccount: BCLPinAccount
	} mutableCopy];
}

- (NSData *)storedPayload {
	NSMutableDictionary *query = [self baseQuery];
	query[(__bridge id)kSecMatchLimit] = (__bridge id)kSecMatchLimitOne;
	query[(__bridge id)kSecReturnData] = @YES;

	CFTypeRef result = NULL;
	OSStatus status = SecItemCopyMatching((__bridge CFDictionaryRef)query, &result);
	if (status != errSecSuccess || result == NULL) {
		if (result != NULL) {
			CFRelease(result);
		}
		return nil;
	}
	return CFBridgingRelease(result);
}

- (BOOL)hasPIN {
	return [self storedPayload] != nil;
}

- (NSData *)derivedHashForPIN:(NSString *)pin salt:(NSData *)salt rounds:(uint32_t)rounds {
	NSMutableData *derived = [NSMutableData dataWithLength:BCLHashLength];
	NSData *pinData = [pin dataUsingEncoding:NSUTF8StringEncoding];
	int status = CCKeyDerivationPBKDF(kCCPBKDF2,
		pinData.bytes,
		pinData.length,
		salt.bytes,
		salt.length,
		kCCPRFHmacAlgSHA256,
		rounds,
		derived.mutableBytes,
		derived.length);
	return status == kCCSuccess ? derived : nil;
}

- (BOOL)setPIN:(NSString *)pin error:(NSError **)error {
	NSCharacterSet *notDigits = [[NSCharacterSet decimalDigitCharacterSet] invertedSet];
	if (pin.length != 4 || [pin rangeOfCharacterFromSet:notDigits].location != NSNotFound) {
		if (error != NULL) {
			*error = [NSError errorWithDomain:@"BCLPinError" code:1 userInfo:@{NSLocalizedDescriptionKey: @"Şifre 4 rakam olmalıdır."}];
		}
		return NO;
	}

	NSMutableData *salt = [NSMutableData dataWithLength:BCLSaltLength];
	if (SecRandomCopyBytes(kSecRandomDefault, salt.length, salt.mutableBytes) != errSecSuccess) {
		if (error != NULL) {
			*error = [NSError errorWithDomain:@"BCLPinError" code:2 userInfo:@{NSLocalizedDescriptionKey: @"Güvenli şifre kaydı oluşturulamadı."}];
		}
		return NO;
	}

	NSData *hash = [self derivedHashForPIN:pin salt:salt rounds:BCLPBKDFRounds];
	if (hash == nil) {
		if (error != NULL) {
			*error = [NSError errorWithDomain:@"BCLPinError" code:3 userInfo:@{NSLocalizedDescriptionKey: @"Şifre işlenemedi."}];
		}
		return NO;
	}

	NSDictionary *record = @{
		@"version": @1,
		@"rounds": @(BCLPBKDFRounds),
		@"salt": [salt base64EncodedStringWithOptions:0],
		@"hash": [hash base64EncodedStringWithOptions:0]
	};
	NSData *payload = [NSJSONSerialization dataWithJSONObject:record options:0 error:error];
	if (payload == nil) {
		return NO;
	}

	SecItemDelete((__bridge CFDictionaryRef)[self baseQuery]);
	NSMutableDictionary *query = [self baseQuery];
	query[(__bridge id)kSecValueData] = payload;
	query[(__bridge id)kSecAttrAccessible] = (__bridge id)kSecAttrAccessibleWhenUnlockedThisDeviceOnly;
	OSStatus status = SecItemAdd((__bridge CFDictionaryRef)query, NULL);
	if (status != errSecSuccess && error != NULL) {
		*error = [NSError errorWithDomain:@"BCLPinError" code:status userInfo:@{NSLocalizedDescriptionKey: @"Şifre telefona kaydedilemedi."}];
	}
	return status == errSecSuccess;
}

- (BOOL)verifyPIN:(NSString *)pin {
	NSData *payload = [self storedPayload];
	if (payload == nil) {
		return NO;
	}

	NSDictionary *record = [NSJSONSerialization JSONObjectWithData:payload options:0 error:nil];
	if (![record isKindOfClass:NSDictionary.class]) {
		return NO;
	}
	NSData *salt = [[NSData alloc] initWithBase64EncodedString:record[@"salt"] options:0];
	NSData *expected = [[NSData alloc] initWithBase64EncodedString:record[@"hash"] options:0];
	uint32_t rounds = [record[@"rounds"] unsignedIntValue];
	if (salt.length == 0 || expected.length != BCLHashLength || rounds == 0) {
		return NO;
	}

	NSData *actual = [self derivedHashForPIN:pin salt:salt rounds:rounds];
	if (actual.length != expected.length) {
		return NO;
	}
	const unsigned char *left = actual.bytes;
	const unsigned char *right = expected.bytes;
	unsigned char difference = 0;
	for (NSUInteger index = 0; index < actual.length; index++) {
		difference |= left[index] ^ right[index];
	}
	return difference == 0;
}

@end

