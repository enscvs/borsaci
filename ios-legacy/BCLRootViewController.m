#import "BCLRootViewController.h"
#import "BCLPinStore.h"
#import "BCLPinViewController.h"
#import "BCLWebViewController.h"

@interface BCLRootViewController ()

@property (nonatomic, strong) BCLWebViewController *webViewController;
@property (nonatomic, strong) BCLPinViewController *pinViewController;

@end

@implementation BCLRootViewController

- (void)viewDidLoad {
	[super viewDidLoad];
	self.view.backgroundColor = [UIColor colorWithRed:0.004 green:0.035 blue:0.027 alpha:1.0];

	self.webViewController = [[BCLWebViewController alloc] init];
	[self addChildViewController:self.webViewController];
	self.webViewController.view.frame = self.view.bounds;
	self.webViewController.view.autoresizingMask = UIViewAutoresizingFlexibleWidth | UIViewAutoresizingFlexibleHeight;
	[self.view addSubview:self.webViewController.view];
	[self.webViewController didMoveToParentViewController:self];

	__weak typeof(self) weakSelf = self;
	self.webViewController.changePINHandler = ^{
		[weakSelf showPINWithMode:BCLPinModeChange];
	};

	BCLPinMode firstMode = [[BCLPinStore sharedStore] hasPIN] ? BCLPinModeUnlock : BCLPinModeSetup;
	[self showPINWithMode:firstMode];
}

- (UIStatusBarStyle)preferredStatusBarStyle {
	return UIStatusBarStyleLightContent;
}

- (UIViewController *)childViewControllerForStatusBarStyle {
	return self.pinViewController ?: self.webViewController;
}

- (void)lockApplication {
	if ([[BCLPinStore sharedStore] hasPIN]) {
		[self hidePIN];
		[self showPINWithMode:BCLPinModeUnlock];
	}
}

- (void)showPINWithMode:(BCLPinMode)mode {
	if (self.pinViewController != nil) {
		return;
	}
	__weak typeof(self) weakSelf = self;
	BCLPinViewController *controller = [[BCLPinViewController alloc] initWithMode:mode completion:^{
		[weakSelf hidePIN];
	}];
	self.pinViewController = controller;
	[self addChildViewController:controller];
	controller.view.frame = self.view.bounds;
	controller.view.autoresizingMask = UIViewAutoresizingFlexibleWidth | UIViewAutoresizingFlexibleHeight;
	[self.view addSubview:controller.view];
	[controller didMoveToParentViewController:self];
	[self setNeedsStatusBarAppearanceUpdate];
}

- (void)hidePIN {
	BCLPinViewController *controller = self.pinViewController;
	if (controller == nil) {
		return;
	}
	[controller willMoveToParentViewController:nil];
	[controller.view removeFromSuperview];
	[controller removeFromParentViewController];
	self.pinViewController = nil;
	[self setNeedsStatusBarAppearanceUpdate];
}

@end

