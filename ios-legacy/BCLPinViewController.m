#import "BCLPinViewController.h"
#import "BCLPinStore.h"
#import <math.h>

typedef NS_ENUM(NSInteger, BCLPinStage) {
	BCLPinStageSetupNew,
	BCLPinStageSetupConfirm,
	BCLPinStageUnlock,
	BCLPinStageChangeVerify,
	BCLPinStageChangeNew,
	BCLPinStageChangeConfirm
};

static NSString *const BCLFailedAttemptsKey = @"BCLFailedPinAttempts";
static NSString *const BCLLockoutUntilKey = @"BCLPinLockoutUntil";

@interface BCLPinViewController ()

@property (nonatomic, assign) BCLPinMode mode;
@property (nonatomic, assign) BCLPinStage stage;
@property (nonatomic, copy) void (^completion)(void);
@property (nonatomic, strong) UIImageView *logoView;
@property (nonatomic, strong) UILabel *nameLabel;
@property (nonatomic, strong) UILabel *promptLabel;
@property (nonatomic, strong) UILabel *messageLabel;
@property (nonatomic, strong) NSArray *dotViews;
@property (nonatomic, strong) NSArray *numberButtons;
@property (nonatomic, strong) UIButton *deleteButton;
@property (nonatomic, strong) NSMutableString *digits;
@property (nonatomic, copy) NSString *candidatePIN;
@property (nonatomic, strong) NSTimer *lockoutTimer;

@end

@implementation BCLPinViewController

- (instancetype)initWithMode:(BCLPinMode)mode completion:(void (^)(void))completion {
	self = [super initWithNibName:nil bundle:nil];
	if (self) {
		_mode = mode;
		_completion = [completion copy];
		_digits = [NSMutableString string];
		if (mode == BCLPinModeSetup) {
			_stage = BCLPinStageSetupNew;
		} else if (mode == BCLPinModeChange) {
			_stage = BCLPinStageChangeVerify;
		} else {
			_stage = BCLPinStageUnlock;
		}
	}
	return self;
}

- (void)dealloc {
	[self.lockoutTimer invalidate];
}

- (void)viewDidLoad {
	[super viewDidLoad];
	self.view.backgroundColor = [UIColor colorWithRed:0.004 green:0.035 blue:0.027 alpha:1.0];

	self.logoView = [[UIImageView alloc] initWithImage:[UIImage imageNamed:@"AppIcon60x60"]];
	self.logoView.contentMode = UIViewContentModeScaleAspectFit;
	[self.view addSubview:self.logoView];

	self.nameLabel = [[UILabel alloc] initWithFrame:CGRectZero];
	self.nameLabel.text = @"𐰉𐰆𐰺𐰽𐰀𐰲𐰃";
	self.nameLabel.textAlignment = NSTextAlignmentCenter;
	self.nameLabel.textColor = [UIColor colorWithRed:1.0 green:0.66 blue:0.05 alpha:1.0];
	self.nameLabel.font = [UIFont boldSystemFontOfSize:24.0];
	[self.view addSubview:self.nameLabel];

	self.promptLabel = [[UILabel alloc] initWithFrame:CGRectZero];
	self.promptLabel.textAlignment = NSTextAlignmentCenter;
	self.promptLabel.textColor = UIColor.whiteColor;
	self.promptLabel.font = [UIFont systemFontOfSize:17.0 weight:UIFontWeightSemibold];
	self.promptLabel.numberOfLines = 2;
	[self.view addSubview:self.promptLabel];

	self.messageLabel = [[UILabel alloc] initWithFrame:CGRectZero];
	self.messageLabel.textAlignment = NSTextAlignmentCenter;
	self.messageLabel.textColor = [UIColor colorWithRed:0.72 green:0.78 blue:0.75 alpha:1.0];
	self.messageLabel.font = [UIFont systemFontOfSize:13.0];
	self.messageLabel.numberOfLines = 2;
	[self.view addSubview:self.messageLabel];

	NSMutableArray *dots = [NSMutableArray arrayWithCapacity:4];
	for (NSInteger index = 0; index < 4; index++) {
		UIView *dot = [[UIView alloc] initWithFrame:CGRectZero];
		dot.backgroundColor = UIColor.clearColor;
		dot.layer.borderWidth = 1.5;
		dot.layer.borderColor = [UIColor colorWithRed:1.0 green:0.66 blue:0.05 alpha:1.0].CGColor;
		[self.view addSubview:dot];
		[dots addObject:dot];
	}
	self.dotViews = dots;

	NSMutableArray *buttons = [NSMutableArray arrayWithCapacity:10];
	for (NSInteger number = 0; number <= 9; number++) {
		UIButton *button = [UIButton buttonWithType:UIButtonTypeCustom];
		button.tag = number;
		[button setTitle:[NSString stringWithFormat:@"%ld", (long)number] forState:UIControlStateNormal];
		[button setTitleColor:[UIColor colorWithRed:1.0 green:0.72 blue:0.18 alpha:1.0] forState:UIControlStateNormal];
		button.titleLabel.font = [UIFont systemFontOfSize:25.0 weight:UIFontWeightMedium];
		button.backgroundColor = [UIColor colorWithRed:0.025 green:0.13 blue:0.10 alpha:1.0];
		button.layer.borderWidth = 1.0;
		button.layer.borderColor = [UIColor colorWithRed:0.15 green:0.34 blue:0.26 alpha:1.0].CGColor;
		[button addTarget:self action:@selector(numberPressed:) forControlEvents:UIControlEventTouchUpInside];
		[self.view addSubview:button];
		[buttons addObject:button];
	}
	self.numberButtons = buttons;

	self.deleteButton = [UIButton buttonWithType:UIButtonTypeSystem];
	[self.deleteButton setTitle:@"Sil" forState:UIControlStateNormal];
	[self.deleteButton setTitleColor:[UIColor colorWithRed:0.72 green:0.78 blue:0.75 alpha:1.0] forState:UIControlStateNormal];
	self.deleteButton.titleLabel.font = [UIFont systemFontOfSize:16.0 weight:UIFontWeightSemibold];
	[self.deleteButton addTarget:self action:@selector(deletePressed) forControlEvents:UIControlEventTouchUpInside];
	[self.view addSubview:self.deleteButton];

	[self updatePrompt];
	[self updateDots];
	[self refreshLockout];
}

- (UIStatusBarStyle)preferredStatusBarStyle {
	return UIStatusBarStyleLightContent;
}

- (void)viewDidLayoutSubviews {
	[super viewDidLayoutSubviews];
	CGFloat width = CGRectGetWidth(self.view.bounds);
	CGFloat height = CGRectGetHeight(self.view.bounds);
	CGFloat statusHeight = MIN(20.0, CGRectGetHeight(UIApplication.sharedApplication.statusBarFrame));
	CGFloat logoSize = MIN(82.0, height * 0.15);
	CGFloat logoTop = statusHeight + 12.0;
	self.logoView.frame = CGRectMake((width - logoSize) / 2.0, logoTop, logoSize, logoSize);
	self.nameLabel.frame = CGRectMake(12.0, CGRectGetMaxY(self.logoView.frame) + 2.0, width - 24.0, 30.0);
	self.promptLabel.frame = CGRectMake(20.0, CGRectGetMaxY(self.nameLabel.frame) + 3.0, width - 40.0, 45.0);

	CGFloat dotSize = 14.0;
	CGFloat dotGap = 18.0;
	CGFloat dotsWidth = (dotSize * 4.0) + (dotGap * 3.0);
	CGFloat dotTop = CGRectGetMaxY(self.promptLabel.frame) + 10.0;
	for (NSInteger index = 0; index < self.dotViews.count; index++) {
		UIView *dot = self.dotViews[index];
		dot.frame = CGRectMake((width - dotsWidth) / 2.0 + index * (dotSize + dotGap), dotTop, dotSize, dotSize);
		dot.layer.cornerRadius = dotSize / 2.0;
	}
	self.messageLabel.frame = CGRectMake(18.0, dotTop + dotSize + 5.0, width - 36.0, 35.0);

	CGFloat keypadTop = CGRectGetMaxY(self.messageLabel.frame) + 5.0;
	CGFloat horizontalMargin = 38.0;
	CGFloat columnGap = 18.0;
	CGFloat buttonWidth = floor((width - (horizontalMargin * 2.0) - (columnGap * 2.0)) / 3.0);
	CGFloat rowGap = 10.0;
	CGFloat availableHeight = height - keypadTop - 12.0;
	CGFloat buttonHeight = MIN(buttonWidth, floor((availableHeight - (rowGap * 3.0)) / 4.0));

	for (NSInteger number = 1; number <= 9; number++) {
		NSInteger row = (number - 1) / 3;
		NSInteger column = (number - 1) % 3;
		UIButton *button = self.numberButtons[number];
		button.frame = CGRectMake(horizontalMargin + column * (buttonWidth + columnGap), keypadTop + row * (buttonHeight + rowGap), buttonWidth, buttonHeight);
		button.layer.cornerRadius = buttonHeight / 2.0;
	}
	UIButton *zeroButton = self.numberButtons[0];
	zeroButton.frame = CGRectMake(horizontalMargin + buttonWidth + columnGap, keypadTop + 3.0 * (buttonHeight + rowGap), buttonWidth, buttonHeight);
	zeroButton.layer.cornerRadius = buttonHeight / 2.0;
	self.deleteButton.frame = CGRectMake(horizontalMargin + 2.0 * (buttonWidth + columnGap), keypadTop + 3.0 * (buttonHeight + rowGap), buttonWidth, buttonHeight);
}

- (void)updatePrompt {
	switch (self.stage) {
		case BCLPinStageSetupNew:
			self.promptLabel.text = @"Yeni 4 haneli şifreni belirle";
			self.messageLabel.text = @"Bu şifre yalnızca bu telefonda saklanır.";
			break;
		case BCLPinStageSetupConfirm:
			self.promptLabel.text = @"Yeni şifreyi tekrar gir";
			self.messageLabel.text = @"";
			break;
		case BCLPinStageUnlock:
			self.promptLabel.text = @"Uygulama şifresini gir";
			self.messageLabel.text = @"";
			break;
		case BCLPinStageChangeVerify:
			self.promptLabel.text = @"Mevcut şifreni gir";
			self.messageLabel.text = @"Ardından yeni şifreni belirleyebilirsin.";
			break;
		case BCLPinStageChangeNew:
			self.promptLabel.text = @"Yeni 4 haneli şifreni gir";
			self.messageLabel.text = @"";
			break;
		case BCLPinStageChangeConfirm:
			self.promptLabel.text = @"Yeni şifreyi tekrar gir";
			self.messageLabel.text = @"";
			break;
	}
}

- (void)updateDots {
	UIColor *gold = [UIColor colorWithRed:1.0 green:0.66 blue:0.05 alpha:1.0];
	for (NSInteger index = 0; index < self.dotViews.count; index++) {
		UIView *dot = self.dotViews[index];
		dot.backgroundColor = index < self.digits.length ? gold : UIColor.clearColor;
	}
	self.deleteButton.enabled = self.digits.length > 0;
	self.deleteButton.alpha = self.deleteButton.enabled ? 1.0 : 0.35;
}

- (void)setKeypadEnabled:(BOOL)enabled {
	for (UIButton *button in self.numberButtons) {
		button.enabled = enabled;
		button.alpha = enabled ? 1.0 : 0.35;
	}
	self.deleteButton.enabled = enabled && self.digits.length > 0;
}

- (void)numberPressed:(UIButton *)sender {
	if (self.digits.length >= 4 || [self isLockedOut]) {
		return;
	}
	[self.digits appendFormat:@"%ld", (long)sender.tag];
	[self updateDots];
	if (self.digits.length == 4) {
		[self setKeypadEnabled:NO];
		dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.13 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
			[self submitDigits];
		});
	}
}

- (void)deletePressed {
	if (self.digits.length > 0) {
		[self.digits deleteCharactersInRange:NSMakeRange(self.digits.length - 1, 1)];
		[self updateDots];
	}
}

- (BOOL)isLockedOut {
	NSDate *until = [[NSUserDefaults standardUserDefaults] objectForKey:BCLLockoutUntilKey];
	return [until isKindOfClass:NSDate.class] && [until timeIntervalSinceNow] > 0;
}

- (void)recordFailedAttempt {
	NSUserDefaults *defaults = [NSUserDefaults standardUserDefaults];
	NSInteger failures = [defaults integerForKey:BCLFailedAttemptsKey] + 1;
	if (failures >= 5) {
		[defaults setInteger:0 forKey:BCLFailedAttemptsKey];
		[defaults setObject:[NSDate dateWithTimeIntervalSinceNow:30.0] forKey:BCLLockoutUntilKey];
		[defaults synchronize];
		[self refreshLockout];
	} else {
		[defaults setInteger:failures forKey:BCLFailedAttemptsKey];
		[defaults synchronize];
		self.messageLabel.textColor = [UIColor colorWithRed:1.0 green:0.35 blue:0.25 alpha:1.0];
		self.messageLabel.text = [NSString stringWithFormat:@"Hatalı şifre. %ld deneme hakkı kaldı.", (long)(5 - failures)];
	}
}

- (void)clearFailedAttempts {
	NSUserDefaults *defaults = [NSUserDefaults standardUserDefaults];
	[defaults removeObjectForKey:BCLFailedAttemptsKey];
	[defaults removeObjectForKey:BCLLockoutUntilKey];
	[defaults synchronize];
}

- (void)refreshLockout {
	if (![self isLockedOut]) {
		[self.lockoutTimer invalidate];
		self.lockoutTimer = nil;
		[self setKeypadEnabled:YES];
		return;
	}
	NSDate *until = [[NSUserDefaults standardUserDefaults] objectForKey:BCLLockoutUntilKey];
	NSInteger seconds = MAX(1, (NSInteger)ceil([until timeIntervalSinceNow]));
	self.messageLabel.textColor = [UIColor colorWithRed:1.0 green:0.45 blue:0.2 alpha:1.0];
	self.messageLabel.text = [NSString stringWithFormat:@"Çok fazla deneme. %ld saniye bekle.", (long)seconds];
	[self setKeypadEnabled:NO];
	if (self.lockoutTimer == nil) {
		self.lockoutTimer = [NSTimer scheduledTimerWithTimeInterval:1.0 target:self selector:@selector(refreshLockout) userInfo:nil repeats:YES];
	}
}

- (void)resetEntry {
	[self.digits setString:@""];
	[self updateDots];
	if (![self isLockedOut]) {
		[self setKeypadEnabled:YES];
	}
}

- (void)submitDigits {
	NSString *entered = [self.digits copy];
	switch (self.stage) {
		case BCLPinStageUnlock:
		case BCLPinStageChangeVerify: {
			if ([[BCLPinStore sharedStore] verifyPIN:entered]) {
				[self clearFailedAttempts];
				if (self.stage == BCLPinStageUnlock) {
					[self finishSuccessfully];
					return;
				}
				self.stage = BCLPinStageChangeNew;
				self.messageLabel.textColor = [UIColor colorWithRed:0.72 green:0.78 blue:0.75 alpha:1.0];
				[self resetEntry];
				[self updatePrompt];
			} else {
				[self recordFailedAttempt];
				[self resetEntry];
			}
			break;
		}
		case BCLPinStageSetupNew:
		case BCLPinStageChangeNew:
			self.candidatePIN = entered;
			self.stage = self.stage == BCLPinStageSetupNew ? BCLPinStageSetupConfirm : BCLPinStageChangeConfirm;
			[self resetEntry];
			[self updatePrompt];
			break;
		case BCLPinStageSetupConfirm:
		case BCLPinStageChangeConfirm:
			if (![entered isEqualToString:self.candidatePIN]) {
				self.candidatePIN = nil;
				self.stage = self.stage == BCLPinStageSetupConfirm ? BCLPinStageSetupNew : BCLPinStageChangeNew;
				[self resetEntry];
				[self updatePrompt];
				self.messageLabel.textColor = [UIColor colorWithRed:1.0 green:0.35 blue:0.25 alpha:1.0];
				self.messageLabel.text = @"Şifreler eşleşmedi. Baştan dene.";
				return;
			}
			NSError *error = nil;
			if ([[BCLPinStore sharedStore] setPIN:entered error:&error]) {
				[self clearFailedAttempts];
				[self finishSuccessfully];
			} else {
				[self resetEntry];
				self.messageLabel.textColor = [UIColor colorWithRed:1.0 green:0.35 blue:0.25 alpha:1.0];
				self.messageLabel.text = error.localizedDescription ?: @"Şifre kaydedilemedi.";
			}
			break;
	}
}

- (void)finishSuccessfully {
	self.messageLabel.textColor = [UIColor colorWithRed:0.25 green:0.9 blue:0.55 alpha:1.0];
	self.messageLabel.text = self.mode == BCLPinModeChange ? @"Şifre değiştirildi." : @"Kilidi açıldı.";
	[self setKeypadEnabled:NO];
	dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.18 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
		if (self.completion != nil) {
			self.completion();
		}
	});
}

@end

