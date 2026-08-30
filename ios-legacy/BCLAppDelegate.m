#import "BCLAppDelegate.h"
#import "BCLRootViewController.h"

@implementation BCLAppDelegate

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions {
	(void)application;
	(void)launchOptions;

	self.window = [[UIWindow alloc] initWithFrame:UIScreen.mainScreen.bounds];
	self.window.backgroundColor = [UIColor colorWithRed:0.004 green:0.035 blue:0.027 alpha:1.0];
	self.rootViewController = [[BCLRootViewController alloc] init];
	self.window.rootViewController = self.rootViewController;
	[self.window makeKeyAndVisible];
	return YES;
}

- (void)applicationDidEnterBackground:(UIApplication *)application {
	(void)application;
	[self.rootViewController lockApplication];
}

@end

