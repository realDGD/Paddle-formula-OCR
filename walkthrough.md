# Walkthrough: Fixed Restore Button Visibility & Crop Applied State (Version 0.3.45)

## Bug Found & Fixed

- **Root Cause**: In `$('#crop-apply').addEventListener('click', ...)`, `setImage(...)` was invoked without passing `isCropped = true` (defaulting to `isCropped = false`). As a result, `state.originalFile` was overwritten with the newly cropped file, and `state.isCropped` evaluated to `false`, keeping `#restore-image` hidden.
- **Fix Applied**:
  1. Updated `crop-apply` in `static/app.js` to pass `setImage(file, true)`.
  2. Fixed `state.isCropped` flag handling inside `setImage`. Now `#restore-image` (还原原图) immediately appears upon applying crop!
  3. Updated `openCrop()` to load from `state.originalFile`, ensuring the crop dialog canvas always presents the full uncropped image even on subsequent crops.

## Verification
- Unit test suite: 44 tests passed (`uv run python -m unittest discover tests`).
- FPK built successfully: `paddle-formula-ocr.fpk` (version `0.3.45`).
