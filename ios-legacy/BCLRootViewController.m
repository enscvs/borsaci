#import "BCLRootViewController.h"
#import "BCLPinStore.h"
#import "BCLPinViewController.h"
#import "BCLSplashViewController.h"
#import "BCLWebViewController.h"

@interface BCLRootViewController ()

@property (nonatomic, strong) BCLWebViewController *webViewController;
@property (nonatomic, strong) BCLPinViewController *pinViewController;
@property (nonatomic, strong) BCLSplashViewController *splashViewController;

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

	[self showSplash];
}

- (UIStatusBarStyle)preferredStatusBarStyle {
	return UIStatusBarStyleLightContent;
}

- (UIViewController *)childViewControllerForStatusBarStyle {
	return self.splashViewController ?: self.pinViewController ?: self.webViewController;
}

- (UIViewController *)childViewControllerForStatusBarHidden {
	return self.splashViewController ?: self.pinViewController ?: self.webViewController;
}

- (void)lockApplication {
	if (self.splashViewController != nil) {
		return;
	}
	if ([[BCLPinStore sharedStore] hasPIN]) {
		[self hidePIN];
		[self showPINWithMode:BCLPinModeUnlock];
	}
}

- (void)showSplash {
	__weak typeof(self) weakSelf = self;
	BCLSplashViewController *controller = [[BCLSplashViewController alloc] initWithCompletion:^{
		[weakSelf finishSplash];
	}];
	self.splashViewController = controller;
	[self addChildViewController:controller];
	controller.view.frame = self.view.bounds;
	controller.view.autoresizingMask = UIViewAutoresizingFlexibleWidth | UIViewAutoresizingFlexibleHeight;
	[self.view addSubview:controller.view];
	[controller didMoveToParentViewController:self];
	[self setNeedsStatusBarAppearanceUpdate];
}

- (void)finishSplash {
	BCLSplashViewController *controller = self.splashViewController;
	if (controller == nil) {
		return;
	}
	BCLPinMode firstMode = [[BCLPinStore sharedStore] hasPIN] ? BCLPinModeUnlock : BCLPinModeSetup;
	[self showPINWithMode:firstMode];
	[self.view bringSubviewToFront:controller.view];
	[UIView animateWithDuration:0.32 animations:^{
		controller.view.alpha = 0.0;
	} completion:^(BOOL finished) {
		(void)finished;
		[controller willMoveToParentViewController:nil];
		[controller.view removeFromSuperview];
		[controller removeFromParentViewController];
		self.splashViewController = nil;
		[self setNeedsStatusBarAppearanceUpdate];
	}];
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

