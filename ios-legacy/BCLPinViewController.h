#import <UIKit/UIKit.h>

typedef NS_ENUM(NSInteger, BCLPinMode) {
	BCLPinModeSetup,
	BCLPinModeUnlock,
	BCLPinModeChange
};

@interface BCLPinViewController : UIViewController

- (instancetype)initWithMode:(BCLPinMode)mode completion:(void (^)(void))completion;

@end

