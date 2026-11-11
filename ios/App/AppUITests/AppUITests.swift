import XCTest

final class AppUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    private func attachScreenshot(named name: String) {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    private func exactButton(_ label: String, in app: XCUIApplication) -> XCUIElement {
        app.buttons.matching(NSPredicate(format: "label == %@", label)).firstMatch
    }

    private func buttonContaining(_ text: String, in app: XCUIApplication) -> XCUIElement {
        app.buttons.matching(NSPredicate(format: "label CONTAINS[c] %@", text)).firstMatch
    }

    private func staticTextContaining(_ text: String, in app: XCUIApplication) -> XCUIElement {
        app.staticTexts.matching(NSPredicate(format: "label CONTAINS[c] %@", text)).firstMatch
    }

    private func tapWhenReady(_ element: XCUIElement) {
        XCTAssertTrue(element.waitForExistence(timeout: 15), "Expected element to exist before tapping: \(element)")
        XCTAssertTrue(element.isHittable, "Expected element to be hittable: \(element)")
        element.tap()
    }

    private func scrollToAndTapContent(_ element: XCUIElement, in app: XCUIApplication) {
        XCTAssertTrue(element.waitForExistence(timeout: 15), "Expected element to exist before tapping: \(element)")
        let maxSafeMidY = app.frame.height - 120
        for _ in 0..<5 {
            if element.isHittable && element.frame.midY > 60 && element.frame.midY < maxSafeMidY {
                break
            }
            if element.frame.midY <= 60 {
                app.swipeDown()
            } else {
                app.swipeUp()
            }
            Thread.sleep(forTimeInterval: 0.4)
        }
        XCTAssertTrue(element.isHittable, "Expected element to become hittable: \(element)")
        element.tap()
    }

    func testBundledReaderLaunchLifecycleAndRestart() throws {
        let app = XCUIApplication()
        app.launch()

        XCTAssertTrue(app.wait(for: .runningForeground, timeout: 20), "App failed to enter foreground on launch")
        XCTAssertTrue(app.webViews.firstMatch.waitForExistence(timeout: 20), "Capacitor WKWebView did not appear")

        // Verify bundled web entrypoint rendered real onboarding UI rather than a blank/error screen.
        let continueButton = exactButton("Continue", in: app)
        XCTAssertTrue(continueButton.waitForExistence(timeout: 25), "Onboarding Continue button not rendered in WKWebView")
        XCTAssertTrue(
            staticTextContaining("quiet place", in: app).waitForExistence(timeout: 10),
            "Onboarding headline did not render in WKWebView"
        )
        attachScreenshot(named: "01-onboarding-step1")

        // Complete onboarding -> Today screen.
        scrollToAndTapContent(continueButton, in: app)
        let continueToTodayButton = exactButton("Continue to Today", in: app)
        XCTAssertTrue(continueToTodayButton.waitForExistence(timeout: 10), "Onboarding step 2 did not appear")
        scrollToAndTapContent(continueToTodayButton, in: app)

        // Verify primary tabs are exposed in the WebView accessibility tree and Today content renders.
        let todayTab = exactButton("Today", in: app)
        let foundationsTab = exactButton("Foundations", in: app)
        let archiveTab = exactButton("Archive", in: app)
        let moreTab = exactButton("More", in: app)

        XCTAssertTrue(todayTab.waitForExistence(timeout: 15), "Today tab missing after onboarding")
        XCTAssertTrue(foundationsTab.exists, "Foundations tab missing")
        XCTAssertTrue(archiveTab.exists, "Archive tab missing")
        XCTAssertTrue(moreTab.exists, "More tab missing")
        XCTAssertTrue(
            staticTextContaining("SCRIPTURE CHALLENGE", in: app).waitForExistence(timeout: 10),
            "Today Scripture Challenge eyebrow did not render"
        )
        attachScreenshot(named: "02-today-screen")

        // Ordinary shell tab navigation.
        tapWhenReady(foundationsTab)
        XCTAssertTrue(
            staticTextContaining("A Place to Begin", in: app).waitForExistence(timeout: 10),
            "Foundations view did not render"
        )
        tapWhenReady(archiveTab)
        XCTAssertTrue(
            staticTextContaining("Explore Past Scripture Challenges", in: app).waitForExistence(timeout: 10),
            "Archive view did not render"
        )
        tapWhenReady(todayTab)

        // Background and return to foreground.
        XCUIDevice.shared.press(.home)
        Thread.sleep(forTimeInterval: 2.0)
        app.activate()
        XCTAssertTrue(app.wait(for: .runningForeground, timeout: 15), "App failed to resume to foreground")
        XCTAssertTrue(foundationsTab.waitForExistence(timeout: 10), "Primary UI missing after foreground resume")
        tapWhenReady(foundationsTab)
        XCTAssertTrue(
            staticTextContaining("A Place to Begin", in: app).waitForExistence(timeout: 10),
            "WebView UI unresponsive after foreground resume"
        )
        attachScreenshot(named: "03-after-foreground")

        // Terminate and relaunch: onboarding completion persists in WKWebView localStorage.
        app.terminate()
        app.launch()
        XCTAssertTrue(app.wait(for: .runningForeground, timeout: 20), "App failed to enter foreground on relaunch")
        XCTAssertTrue(todayTab.waitForExistence(timeout: 20), "Today tab missing after terminate and relaunch")
        XCTAssertFalse(
            exactButton("Continue to Today", in: app).exists,
            "App reverted to onboarding after terminate and relaunch"
        )
        attachScreenshot(named: "04-after-terminate-relaunch")

        // Verify More -> Privacy & local data -> Reset local app data -> Erase & reset restores onboarding.
        tapWhenReady(moreTab)
        scrollToAndTapContent(buttonContaining("Privacy & local data", in: app), in: app)
        XCTAssertTrue(
            staticTextContaining("PRIVACY & LOCAL DATA", in: app).waitForExistence(timeout: 10),
            "Privacy & local data view did not render"
        )
        let resetButton = exactButton("Reset local app data", in: app)
        XCTAssertTrue(resetButton.waitForExistence(timeout: 10), "Reset local app data button missing")
        attachScreenshot(named: "05-privacy-local-data")

        scrollToAndTapContent(resetButton, in: app)
        XCTAssertTrue(
            staticTextContaining("Reset all local app data?", in: app).waitForExistence(timeout: 10),
            "Reset confirmation panel did not appear"
        )
        let eraseButton = exactButton("Erase & reset", in: app)
        scrollToAndTapContent(eraseButton, in: app)

        XCTAssertTrue(
            exactButton("Continue", in: app).waitForExistence(timeout: 15),
            "Onboarding Continue button did not reappear after Erase & reset"
        )
        XCTAssertTrue(
            staticTextContaining("quiet place", in: app).waitForExistence(timeout: 10),
            "Onboarding headline did not reappear after Erase & reset"
        )
        XCTAssertFalse(
            exactButton("Today", in: app).exists,
            "Today tab should not remain visible after Erase & reset"
        )
        XCTAssertFalse(
            staticTextContaining("Unable to reset local app data", in: app).exists,
            "Reset failed with storage unavailable error"
        )
        attachScreenshot(named: "06-after-privacy-reset")

        // Terminate and relaunch after reset: onboarding remains restored.
        app.terminate()
        app.launch()
        XCTAssertTrue(app.wait(for: .runningForeground, timeout: 20), "App failed to enter foreground after reset relaunch")
        XCTAssertTrue(
            exactButton("Continue", in: app).waitForExistence(timeout: 20),
            "Onboarding Continue button missing after terminate and relaunch post-reset"
        )
        XCTAssertFalse(
            exactButton("Today", in: app).exists,
            "Today tab unexpectedly reappeared after post-reset relaunch"
        )
        attachScreenshot(named: "07-after-reset-relaunch")
    }
}
