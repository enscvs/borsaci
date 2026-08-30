TARGET := iphone:clang:10.3:10.0
ARCHS := armv7
INSTALL_TARGET_PROCESSES = BorsaciLegacy

include $(THEOS)/makefiles/common.mk

APPLICATION_NAME = BorsaciLegacy

BorsaciLegacy_FILES = \
	main.m \
	BCLAppDelegate.m \
	BCLRootViewController.m \
	BCLPinStore.m \
	BCLPinViewController.m \
	BCLWebViewController.m
BorsaciLegacy_FRAMEWORKS = UIKit WebKit Security
BorsaciLegacy_CFLAGS = -fobjc-arc

include $(THEOS_MAKE_PATH)/application.mk

