select_ios_xcode() {
  test "$(git rev-parse HEAD)" = "$GITHUB_SHA"
  sudo xcode-select --switch /Applications/Xcode_26.4.1.app/Contents/Developer
  xcodebuild -version | tee "$RUNNER_TEMP/xcode-version.txt"
  grep -Fxq 'Xcode 26.4.1' "$RUNNER_TEMP/xcode-version.txt"
  grep -Fxq 'Build version 17E202' "$RUNNER_TEMP/xcode-version.txt"
  xcodebuild -showsdks | tee "$RUNNER_TEMP/xcode-sdks.txt"
  grep -Fq 'iphonesimulator26.4' "$RUNNER_TEMP/xcode-sdks.txt"
}

prepare_ios_project() {
  npm ci
  npm run build
  npx cap sync ios
  grep -Fq 'CapacitorApp' ios/App/CapApp-SPM/Package.swift
  grep -Fq 'CapacitorPreferences' ios/App/CapApp-SPM/Package.swift
}

build_unsigned_ios_app() {
  xcodebuild \
    -project ios/App/App.xcodeproj \
    -scheme App \
    -configuration Debug \
    -sdk iphonesimulator26.4 \
    -destination 'generic/platform=iOS Simulator' \
    -derivedDataPath "$1" \
    CODE_SIGNING_ALLOWED=NO \
    CODE_SIGNING_REQUIRED=NO \
    CODE_SIGN_IDENTITY='' \
    build
}

verify_ios_bundle() {
  local app="$1"
  local bundle_id
  test -d "$app"
  test -s "$app/Info.plist"
  bundle_id=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$app/Info.plist")
  test "$bundle_id" = 'com.example.bibleberry.r20poc'
  test -s "$app/public/index.html"
  test -n "$(find "$app/public/assets" -type f -name '*.js' -size +0c -print -quit)"
  echo "Bundle ID: $bundle_id"
  echo "Build SHA: $GITHUB_SHA"
  echo "App size: $(du -sh "$app" | cut -f1)"
}

run_ios_smoke_unit_tests() {
  PYTHONDONTWRITEBYTECODE=1 python3 -m unittest -v tests/ci/test_ios_simulator_smoke.py
}
