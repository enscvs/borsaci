#import <UIKit/UIKit.h>

@interface BCLWebViewController : UIViewController

@property (nonatomic, copy) void (^changePINHandler)(void);
- (void)reloadPage;

@end

