#import "BCLSplashViewController.h"

@interface BCLSplashViewController ()

@property (nonatomic, copy) void (^completion)(void);
@property (nonatomic, strong) UIView *gridView;
@property (nonatomic, strong) UIView *reticleView;
@property (nonatomic, strong) UIImageView *emblemView;
@property (nonatomic, strong) UIView *scanLine;
@property (nonatomic, strong) UILabel *titleLabel;
@property (nonatomic, strong) UILabel *unitLabel;
@property (nonatomic, strong) UILabel *telemetryLabel;
@property (nonatomic, strong) NSArray *bootLabels;
@property (nonatomic, strong) UILabel *stageLabel;
@property (nonatomic, strong) UILabel *percentLabel;
@property (nonatomic, strong) UIView *progressTrack;
@property (nonatomic, strong) UIView *progressFill;
@property (nonatomic, strong) UILabel *footerLabel;
@property (nonatomic, strong) NSTimer *progressTimer;
@property (nonatomic, assign) NSInteger progress;
@property (nonatomic, assign) BOOL animationStarted;

@end

@implementation BCLSplashViewController

static UIColor *BCLDarkColor(void) {
	return [UIColor colorWithRed:0.004 green:0.035 blue:0.027 alpha:1.0];
}

static UIColor *BCLGoldColor(void) {
	return [UIColor colorWithRed:1.0 green:0.66 blue:0.05 alpha:1.0];
}

static UIColor *BCLMutedGreenColor(void) {
	return [UIColor colorWithRed:0.48 green:0.64 blue:0.55 alpha:1.0];
}

- (instancetype)initWithCompletion:(void (^)(void))completion {
	self = [super initWithNibName:nil bundle:nil];
	if (self) {
		_completion = [completion copy];
	}
	return self;
}

- (void)dealloc {
	[self.progressTimer invalidate];
}

- (void)viewDidLoad {
	[super viewDidLoad];
	self.view.backgroundColor = BCLDarkColor();
	self.view.clipsToBounds = YES;

	self.gridView = [[UIView alloc] initWithFrame:CGRectZero];
	self.gridView.userInteractionEnabled = NO;
	self.gridView.alpha = 0.12;
	[self.view addSubview:self.gridView];

	[self addCornerAtTop:YES left:YES];
	[self addCornerAtTop:YES left:NO];
	[self addCornerAtTop:NO left:YES];
	[self addCornerAtTop:NO left:NO];

	UILabel *topLeft = [self tacticalLabelWithText:@"BCL SECURE OPS" size:8.0 color:BCLMutedGreenColor()];
	topLeft.tag = 101;
	[self.view addSubview:topLeft];
	UILabel *topRight = [self tacticalLabelWithText:@"IOS 10.3.4" size:8.0 color:BCLMutedGreenColor()];
	topRight.textAlignment = NSTextAlignmentRight;
	topRight.tag = 102;
	[self.view addSubview:topRight];

	self.reticleView = [[UIView alloc] initWithFrame:CGRectZero];
	self.reticleView.layer.cornerRadius = 71.0;
	self.reticleView.layer.borderWidth = 1.0;
	self.reticleView.layer.borderColor = [UIColor colorWithRed:0.85 green:0.55 blue:0.09 alpha:0.32].CGColor;
	self.reticleView.alpha = 0.0;
	[self.view addSubview:self.reticleView];

	UIView *verticalSight = [[UIView alloc] initWithFrame:CGRectZero];
	verticalSight.backgroundColor = [UIColor colorWithRed:0.91 green:0.62 blue:0.13 alpha:0.38];
	verticalSight.tag = 201;
	[self.reticleView addSubview:verticalSight];
	UIView *horizontalSight = [[UIView alloc] initWithFrame:CGRectZero];
	horizontalSight.backgroundColor = verticalSight.backgroundColor;
	horizontalSight.tag = 202;
	[self.reticleView addSubview:horizontalSight];

	self.emblemView = [[UIImageView alloc] initWithImage:[UIImage imageNamed:@"AppIcon60x60"]];
	self.emblemView.contentMode = UIViewContentModeScaleAspectFit;
	self.emblemView.alpha = 0.0;
	self.emblemView.transform = CGAffineTransformMakeScale(0.72, 0.72);
	[self.view addSubview:self.emblemView];

	self.titleLabel = [[UILabel alloc] initWithFrame:CGRectZero];
	self.titleLabel.text = @"𐰉𐰆𐰺𐰽𐰀𐰲𐰃";
	self.titleLabel.textAlignment = NSTextAlignmentCenter;
	self.titleLabel.textColor = [UIColor colorWithRed:1.0 green:0.74 blue:0.21 alpha:1.0];
	self.titleLabel.font = [UIFont boldSystemFontOfSize:25.0];
	self.titleLabel.alpha = 0.0;
	[self.view addSubview:self.titleLabel];

	self.unitLabel = [self tacticalLabelWithText:@"BRAVO // BİST OPERASYON MERKEZİ" size:8.5 color:[UIColor colorWithRed:0.59 green:0.71 blue:0.65 alpha:1.0]];
	self.unitLabel.textAlignment = NSTextAlignmentCenter;
	self.unitLabel.alpha = 0.0;
	[self.view addSubview:self.unitLabel];

	self.telemetryLabel = [self tacticalLabelWithText:@"TR-34              ARMV7              ŞİFRELİ" size:8.0 color:[UIColor colorWithRed:0.72 green:0.79 blue:0.74 alpha:1.0]];
	self.telemetryLabel.textAlignment = NSTextAlignmentCenter;
	self.telemetryLabel.backgroundColor = [UIColor colorWithRed:0.02 green:0.14 blue:0.09 alpha:0.45];
	self.telemetryLabel.layer.borderWidth = 0.5;
	self.telemetryLabel.layer.borderColor = [UIColor colorWithRed:0.20 green:0.49 blue:0.35 alpha:0.42].CGColor;
	[self.view addSubview:self.telemetryLabel];

	NSArray *messages = @[
		@"› GÜVENLİ KANAL BAŞLATILIYOR",
		@"› PORTFÖY MODÜLÜ BAĞLANIYOR",
		@"› ERİŞİM KİLİDİ HAZIRLANIYOR"
	];
	NSMutableArray *bootLabels = [NSMutableArray arrayWithCapacity:messages.count];
	for (NSString *message in messages) {
		UILabel *label = [self tacticalLabelWithText:message size:9.0 color:[UIColor colorWithRed:0.58 green:0.69 blue:0.63 alpha:1.0]];
		label.alpha = 0.0;
		[self.view addSubview:label];
		[bootLabels addObject:label];
	}
	self.bootLabels = bootLabels;

	self.stageLabel = [self tacticalLabelWithText:@"SİSTEM KONTROLÜ" size:8.0 color:[UIColor colorWithRed:0.89 green:0.63 blue:0.23 alpha:1.0]];
	[self.view addSubview:self.stageLabel];
	self.percentLabel = [self tacticalLabelWithText:@"00%" size:8.0 color:self.stageLabel.textColor];
	self.percentLabel.textAlignment = NSTextAlignmentRight;
	[self.view addSubview:self.percentLabel];

	self.progressTrack = [[UIView alloc] initWithFrame:CGRectZero];
	self.progressTrack.backgroundColor = [UIColor colorWithRed:0.37 green:0.47 blue:0.41 alpha:0.23];
	[self.view addSubview:self.progressTrack];
	self.progressFill = [[UIView alloc] initWithFrame:CGRectZero];
	self.progressFill.backgroundColor = BCLGoldColor();
	self.progressFill.layer.shadowColor = BCLGoldColor().CGColor;
	self.progressFill.layer.shadowOpacity = 0.6;
	self.progressFill.layer.shadowRadius = 4.0;
	[self.progressTrack addSubview:self.progressFill];

	self.footerLabel = [self tacticalLabelWithText:@"KİŞİSEL ERİŞİM // YETKİ SEVİYESİ: BRAVO" size:7.5 color:[UIColor colorWithRed:0.44 green:0.58 blue:0.51 alpha:1.0]];
	self.footerLabel.textAlignment = NSTextAlignmentCenter;
	[self.view addSubview:self.footerLabel];

	self.scanLine = [[UIView alloc] initWithFrame:CGRectZero];
	self.scanLine.backgroundColor = [UIColor colorWithRed:1.0 green:0.72 blue:0.23 alpha:0.20];
	self.scanLine.layer.shadowColor = BCLGoldColor().CGColor;
	self.scanLine.layer.shadowOpacity = 0.55;
	self.scanLine.layer.shadowRadius = 8.0;
	self.scanLine.alpha = 0.0;
	[self.view addSubview:self.scanLine];
}

- (UILabel *)tacticalLabelWithText:(NSString *)text size:(CGFloat)size color:(UIColor *)color {
	UILabel *label = [[UILabel alloc] initWithFrame:CGRectZero];
	label.text = text;
	label.textColor = color;
	label.font = [UIFont fontWithName:@"Courier-Bold" size:size] ?: [UIFont boldSystemFontOfSize:size];
	label.adjustsFontSizeToFitWidth = YES;
	label.minimumScaleFactor = 0.72;
	return label;
}

- (void)addCornerAtTop:(BOOL)top left:(BOOL)left {
	UIView *corner = [[UIView alloc] initWithFrame:CGRectZero];
	corner.tag = 300 + (top ? 10 : 0) + (left ? 1 : 0);
	corner.layer.borderColor = [UIColor colorWithRed:0.85 green:0.55 blue:0.09 alpha:0.78].CGColor;
	corner.layer.borderWidth = 1.0;
	[self.view addSubview:corner];
}

- (BOOL)prefersStatusBarHidden {
	return YES;
}

- (void)viewDidLayoutSubviews {
	[super viewDidLayoutSubviews];
	CGFloat width = CGRectGetWidth(self.view.bounds);
	CGFloat height = CGRectGetHeight(self.view.bounds);
	CGFloat margin = 18.0;

	self.gridView.frame = self.view.bounds;
	[self rebuildGrid];

	UIView *topLeft = [self.view viewWithTag:101];
	UIView *topRight = [self.view viewWithTag:102];
	topLeft.frame = CGRectMake(margin, 15.0, 145.0, 15.0);
	topRight.frame = CGRectMake(width - margin - 100.0, 15.0, 100.0, 15.0);

	CGFloat emblemSize = MIN(146.0, width * 0.46);
	CGFloat emblemTop = 48.0;
	self.reticleView.frame = CGRectMake((width - emblemSize) / 2.0, emblemTop, emblemSize, emblemSize);
	self.reticleView.layer.cornerRadius = emblemSize / 2.0;
	UIView *verticalSight = [self.reticleView viewWithTag:201];
	verticalSight.frame = CGRectMake(floor(emblemSize / 2.0), -7.0, 1.0, emblemSize + 14.0);
	UIView *horizontalSight = [self.reticleView viewWithTag:202];
	horizontalSight.frame = CGRectMake(-7.0, floor(emblemSize / 2.0), emblemSize + 14.0, 1.0);
	self.emblemView.frame = CGRectInset(self.reticleView.frame, 9.0, 9.0);

	self.titleLabel.frame = CGRectMake(12.0, CGRectGetMaxY(self.reticleView.frame) + 2.0, width - 24.0, 32.0);
	self.unitLabel.frame = CGRectMake(12.0, CGRectGetMaxY(self.titleLabel.frame) - 1.0, width - 24.0, 18.0);
	self.telemetryLabel.frame = CGRectMake(margin, CGRectGetMaxY(self.unitLabel.frame) + 13.0, width - (margin * 2.0), 27.0);

	CGFloat bootTop = CGRectGetMaxY(self.telemetryLabel.frame) + 10.0;
	for (NSInteger index = 0; index < self.bootLabels.count; index++) {
		UILabel *label = self.bootLabels[index];
		label.frame = CGRectMake(margin + 5.0, bootTop + (index * 22.0), width - ((margin + 5.0) * 2.0), 18.0);
	}

	CGFloat progressTop = MIN(height - 66.0, bootTop + 73.0);
	self.stageLabel.frame = CGRectMake(margin, progressTop, width * 0.65, 14.0);
	self.percentLabel.frame = CGRectMake(width - margin - 50.0, progressTop, 50.0, 14.0);
	self.progressTrack.frame = CGRectMake(margin, progressTop + 19.0, width - (margin * 2.0), 3.0);
	CGFloat progressWidth = CGRectGetWidth(self.progressTrack.bounds) * ((CGFloat)self.progress / 100.0);
	self.progressFill.frame = CGRectMake(0.0, 0.0, progressWidth, 3.0);
	self.footerLabel.frame = CGRectMake(margin, height - 28.0, width - (margin * 2.0), 14.0);

	for (UIView *corner in self.view.subviews) {
		if (corner.tag < 300 || corner.tag > 311) {
			continue;
		}
		BOOL top = corner.tag >= 310;
		BOOL left = (corner.tag % 10) == 1;
		corner.frame = CGRectMake(left ? 9.0 : width - 31.0, top ? 9.0 : height - 31.0, 22.0, 22.0);
		corner.layer.borderWidth = 0.0;
		CAShapeLayer *shape = [CAShapeLayer layer];
		UIBezierPath *path = [UIBezierPath bezierPath];
		[path moveToPoint:CGPointMake(left ? 22.0 : 0.0, top ? 0.0 : 22.0)];
		[path addLineToPoint:CGPointMake(left ? 0.0 : 22.0, top ? 0.0 : 22.0)];
		[path addLineToPoint:CGPointMake(left ? 0.0 : 22.0, top ? 22.0 : 0.0)];
		shape.path = path.CGPath;
		shape.strokeColor = [UIColor colorWithRed:0.85 green:0.55 blue:0.09 alpha:0.78].CGColor;
		shape.fillColor = UIColor.clearColor.CGColor;
		shape.lineWidth = 1.0;
		[corner.layer.sublayers makeObjectsPerformSelector:@selector(removeFromSuperlayer)];
		[corner.layer addSublayer:shape];
	}

	if (!self.animationStarted) {
		self.scanLine.frame = CGRectMake(0.0, -20.0, width, 8.0);
	}
}

- (void)rebuildGrid {
	[self.gridView.layer.sublayers makeObjectsPerformSelector:@selector(removeFromSuperlayer)];
	CGFloat width = CGRectGetWidth(self.gridView.bounds);
	CGFloat height = CGRectGetHeight(self.gridView.bounds);
	UIColor *gridColor = [UIColor colorWithRed:0.24 green:0.70 blue:0.50 alpha:1.0];
	for (CGFloat x = 0.0; x <= width; x += 24.0) {
		CALayer *line = [CALayer layer];
		line.backgroundColor = gridColor.CGColor;
		line.frame = CGRectMake(x, 0.0, 0.5, height);
		[self.gridView.layer addSublayer:line];
	}
	for (CGFloat y = 0.0; y <= height; y += 24.0) {
		CALayer *line = [CALayer layer];
		line.backgroundColor = gridColor.CGColor;
		line.frame = CGRectMake(0.0, y, width, 0.5);
		[self.gridView.layer addSublayer:line];
	}
}

- (void)viewDidAppear:(BOOL)animated {
	[super viewDidAppear:animated];
	if (self.animationStarted) {
		return;
	}
	self.animationStarted = YES;

	[UIView animateWithDuration:0.68 delay:0.05 options:UIViewAnimationOptionCurveEaseOut animations:^{
		self.reticleView.alpha = 1.0;
		self.emblemView.alpha = 1.0;
		self.emblemView.transform = CGAffineTransformIdentity;
	} completion:nil];
	[UIView animateWithDuration:0.48 delay:0.34 options:UIViewAnimationOptionCurveEaseOut animations:^{
		self.titleLabel.alpha = 1.0;
	} completion:nil];
	[UIView animateWithDuration:0.48 delay:0.52 options:UIViewAnimationOptionCurveEaseOut animations:^{
		self.unitLabel.alpha = 1.0;
	} completion:nil];

	[UIView animateWithDuration:2.75 delay:0.12 options:UIViewAnimationOptionCurveEaseInOut animations:^{
		self.scanLine.alpha = 0.9;
		self.scanLine.frame = CGRectMake(0.0, CGRectGetHeight(self.view.bounds) + 12.0, CGRectGetWidth(self.view.bounds), 8.0);
	} completion:^(BOOL finished) {
		(void)finished;
		self.scanLine.alpha = 0.0;
	}];

	NSArray *delays = @[@0.66, @1.30, @1.94];
	for (NSInteger index = 0; index < self.bootLabels.count; index++) {
		UILabel *label = self.bootLabels[index];
		label.transform = CGAffineTransformMakeTranslation(-7.0, 0.0);
		[UIView animateWithDuration:0.28 delay:[delays[index] doubleValue] options:UIViewAnimationOptionCurveEaseOut animations:^{
			label.alpha = 1.0;
			label.transform = CGAffineTransformIdentity;
		} completion:nil];
	}

	self.progress = 0;
	self.progressTimer = [NSTimer scheduledTimerWithTimeInterval:0.03 target:self selector:@selector(advanceProgress) userInfo:nil repeats:YES];
}

- (void)advanceProgress {
	self.progress = MIN(100, self.progress + 1);
	self.percentLabel.text = [NSString stringWithFormat:@"%02ld%%", (long)self.progress];
	if (self.progress < 34) {
		self.stageLabel.text = @"SİSTEM KONTROLÜ";
	} else if (self.progress < 68) {
		self.stageLabel.text = @"GÜVENLİ KANAL";
	} else if (self.progress < 100) {
		self.stageLabel.text = @"ERİŞİM HAZIRLANIYOR";
	} else {
		self.stageLabel.text = @"BRAVO HAZIR";
	}
	[self.view setNeedsLayout];

	if (self.progress >= 100) {
		[self.progressTimer invalidate];
		self.progressTimer = nil;
		[UIView animateWithDuration:0.18 animations:^{
			self.reticleView.transform = CGAffineTransformMakeScale(1.04, 1.04);
			self.emblemView.transform = CGAffineTransformMakeScale(1.04, 1.04);
		} completion:^(BOOL finished) {
			(void)finished;
			[UIView animateWithDuration:0.18 animations:^{
				self.reticleView.transform = CGAffineTransformIdentity;
				self.emblemView.transform = CGAffineTransformIdentity;
			} completion:^(BOOL innerFinished) {
				(void)innerFinished;
				dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.24 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
					if (self.completion != nil) {
						self.completion();
					}
				});
			}];
		}];
	}
}

@end

