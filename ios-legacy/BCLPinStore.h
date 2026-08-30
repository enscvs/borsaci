#import <Foundation/Foundation.h>

@interface BCLPinStore : NSObject

+ (instancetype)sharedStore;
- (BOOL)hasPIN;
- (BOOL)setPIN:(NSString *)pin error:(NSError **)error;
- (BOOL)verifyPIN:(NSString *)pin;

@end

