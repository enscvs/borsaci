#import "BCLWebViewController.h"
#import <WebKit/WebKit.h>

static NSString *const BCLServerURLString = @"https://gemini-borsaci.onrender.com";

@interface BCLWebViewController () <WKNavigationDelegate>

@property (nonatomic, strong) WKWebView *webView;
@property (nonatomic, strong) UIView *headerView;
@property (nonatomic, strong) UILabel *titleLabel;
@property (nonatomic, strong) UIButton *reloadButton;
@property (nonatomic, strong) UIButton *pinButton;
@property (nonatomic, strong) UIActivityIndicatorView *activityIndicator;
@property (nonatomic, strong) UIView *errorView;
@property (nonatomic, strong) UILabel *errorLabel;
@property (nonatomic, strong) UIButton *retryButton;

@end

@implementation BCLWebViewController

- (void)viewDidLoad {
	[super viewDidLoad];
	self.view.backgroundColor = [UIColor colorWithRed:0.004 green:0.035 blue:0.027 alpha:1.0];

	WKWebViewConfiguration *configuration = [[WKWebViewConfiguration alloc] init];
	configuration.websiteDataStore = [WKWebsiteDataStore defaultDataStore];
	configuration.allowsInlineMediaPlayback = YES;
	self.webView = [[WKWebView alloc] initWithFrame:CGRectZero configuration:configuration];
	self.webView.navigationDelegate = self;
	self.webView.backgroundColor = self.view.backgroundColor;
	self.webView.opaque = NO;
	self.webView.scrollView.keyboardDismissMode = UIScrollViewKeyboardDismissModeOnDrag;
	[self.view addSubview:self.webView];

	self.headerView = [[UIView alloc] initWithFrame:CGRectZero];
	self.headerView.backgroundColor = [UIColor colorWithRed:0.008 green:0.075 blue:0.058 alpha:0.98];
	self.headerView.layer.borderColor = [UIColor colorWithRed:0.28 green:0.20 blue:0.05 alpha:1.0].CGColor;
	self.headerView.layer.borderWidth = 0.5;
	[self.view addSubview:self.headerView];

	self.titleLabel = [[UILabel alloc] initWithFrame:CGRectZero];
	self.titleLabel.text = @"𐰉𐰆𐰺𐰽𐰀𐰲𐰃";
	self.titleLabel.textColor = [UIColor colorWithRed:1.0 green:0.66 blue:0.05 alpha:1.0];
	self.titleLabel.textAlignment = NSTextAlignmentCenter;
	self.titleLabel.font = [UIFont boldSystemFontOfSize:17.0];
	[self.headerView addSubview:self.titleLabel];

	self.reloadButton = [self headerButtonWithTitle:@"Yenile" action:@selector(reloadPage)];
	[self.headerView addSubview:self.reloadButton];
	self.pinButton = [self headerButtonWithTitle:@"Şifre" action:@selector(changePINPressed)];
	[self.headerView addSubview:self.pinButton];

	self.activityIndicator = [[UIActivityIndicatorView alloc] initWithActivityIndicatorStyle:UIActivityIndicatorViewStyleWhite];
	self.activityIndicator.hidesWhenStopped = YES;
	[self.headerView addSubview:self.activityIndicator];

	self.errorView = [[UIView alloc] initWithFrame:CGRectZero];
	self.errorView.backgroundColor = self.view.backgroundColor;
	self.errorView.hidden = YES;
	[self.view addSubview:self.errorView];

	self.errorLabel = [[UILabel alloc] initWithFrame:CGRectZero];
	self.errorLabel.textColor = UIColor.whiteColor;
	self.errorLabel.textAlignment = NSTextAlignmentCenter;
	self.errorLabel.numberOfLines = 0;
	self.errorLabel.font = [UIFont systemFontOfSize:15.0];
	[self.errorView addSubview:self.errorLabel];

	self.retryButton = [UIButton buttonWithType:UIButtonTypeCustom];
	[self.retryButton setTitle:@"Tekrar Dene" forState:UIControlStateNormal];
	[self.retryButton setTitleColor:[UIColor colorWithRed:0.02 green:0.08 blue:0.05 alpha:1.0] forState:UIControlStateNormal];
	self.retryButton.backgroundColor = [UIColor colorWithRed:1.0 green:0.66 blue:0.05 alpha:1.0];
	self.retryButton.layer.cornerRadius = 8.0;
	self.retryButton.titleLabel.font = [UIFont boldSystemFontOfSize:15.0];
	[self.retryButton addTarget:self action:@selector(reloadPage) forControlEvents:UIControlEventTouchUpInside];
	[self.errorView addSubview:self.retryButton];

	[self reloadPage];
}

- (UIButton *)headerButtonWithTitle:(NSString *)title action:(SEL)action {
	UIButton *button = [UIButton buttonWithType:UIButtonTypeSystem];
	[button setTitle:title forState:UIControlStateNormal];
	[button setTitleColor:[UIColor colorWithRed:1.0 green:0.72 blue:0.18 alpha:1.0] forState:UIControlStateNormal];
	button.titleLabel.font = [UIFont systemFontOfSize:13.0 weight:UIFontWeightSemibold];
	[button addTarget:self action:action forControlEvents:UIControlEventTouchUpInside];
	return button;
}

- (void)viewDidLayoutSubviews {
	[super viewDidLayoutSubviews];
	CGFloat width = CGRectGetWidth(self.view.bounds);
	CGFloat height = CGRectGetHeight(self.view.bounds);
	CGFloat statusHeight = MIN(20.0, CGRectGetHeight(UIApplication.sharedApplication.statusBarFrame));
	CGFloat headerHeight = 44.0;
	self.headerView.frame = CGRectMake(0.0, statusHeight, width, headerHeight);
	self.reloadButton.frame = CGRectMake(4.0, 0.0, 58.0, headerHeight);
	self.pinButton.frame = CGRectMake(width - 62.0, 0.0, 58.0, headerHeight);
	self.titleLabel.frame = CGRectMake(62.0, 0.0, width - 124.0, headerHeight);
	self.activityIndicator.center = CGPointMake(width - 72.0, headerHeight / 2.0);
	CGFloat contentTop = statusHeight + headerHeight;
	self.webView.frame = CGRectMake(0.0, contentTop, width, height - contentTop);
	self.errorView.frame = self.webView.frame;
	self.errorLabel.frame = CGRectMake(24.0, 80.0, width - 48.0, 100.0);
	self.retryButton.frame = CGRectMake((width - 150.0) / 2.0, CGRectGetMaxY(self.errorLabel.frame) + 18.0, 150.0, 44.0);
}

- (UIStatusBarStyle)preferredStatusBarStyle {
	return UIStatusBarStyleLightContent;
}

- (void)reloadPage {
	self.errorView.hidden = YES;
	NSURL *url = [NSURL URLWithString:BCLServerURLString];
	NSMutableURLRequest *request = [NSMutableURLRequest requestWithURL:url cachePolicy:NSURLRequestReloadIgnoringLocalCacheData timeoutInterval:45.0];
	[request setValue:@"BorsaciLegacy/1.0 iOS10" forHTTPHeaderField:@"X-Borsaci-Client"];
	[self.webView loadRequest:request];
}

- (void)changePINPressed {
	if (self.changePINHandler != nil) {
		self.changePINHandler();
	}
}

- (void)webView:(WKWebView *)webView didStartProvisionalNavigation:(WKNavigation *)navigation {
	(void)webView;
	(void)navigation;
	[self.activityIndicator startAnimating];
	self.reloadButton.hidden = YES;
}

- (void)webView:(WKWebView *)webView didFinishNavigation:(WKNavigation *)navigation {
	(void)webView;
	(void)navigation;
	[self.activityIndicator stopAnimating];
	self.reloadButton.hidden = NO;
	self.errorView.hidden = YES;
}

- (void)webView:(WKWebView *)webView didFailProvisionalNavigation:(WKNavigation *)navigation withError:(NSError *)error {
	(void)webView;
	(void)navigation;
	[self showError:error];
}

- (void)webView:(WKWebView *)webView didFailNavigation:(WKNavigation *)navigation withError:(NSError *)error {
	(void)webView;
	(void)navigation;
	[self showError:error];
}

- (void)showError:(NSError *)error {
	[self.activityIndicator stopAnimating];
	self.reloadButton.hidden = NO;
	self.errorView.hidden = NO;
	if (error.code == NSURLErrorSecureConnectionFailed || error.code == NSURLErrorServerCertificateUntrusted) {
		self.errorLabel.text = @"iPhone 5, sunucunun güvenlik sertifikasına bağlanamadı. Tarih ve saat ayarını kontrol edip tekrar dene.";
	} else if (error.code == NSURLErrorNotConnectedToInternet) {
		self.errorLabel.text = @"İnternet bağlantısı yok. Wi‑Fi veya hücresel bağlantıyı kontrol et.";
	} else {
		self.errorLabel.text = @"Borsacı sunucusuna bağlanılamadı. Biraz bekleyip tekrar dene.";
	}
}

@end

