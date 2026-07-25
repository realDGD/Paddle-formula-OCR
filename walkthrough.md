# Walkthrough: Socket Shutdown Order & Supervisor Reader Fix (Version 0.3.74)

## Key Accomplishments

1. **Fixed Socket File Descriptor Crash (`Invalid file descriptor: -1`)**:
   - **Root Cause**: Previously, `self._sock.close()` was executed *before* `self._server.should_exit = True` finished awaiting Uvicorn's background task `_run_server()`. Closing the socket while Uvicorn was inside `select/epoll` caused `OSError: Invalid file descriptor: -1`, which crashed Uvicorn's event loop and left background tasks in a hung/timed-out state!
   - **Fix**: Reordered `stop()` to set `self._server.should_exit = True`, wait up to 1.0s for `self._task` to finish Uvicorn's `server.serve()` loop cleanly, and ONLY THEN close `sock_to_close.close()`. Uvicorn now shuts down gracefully without any file descriptor errors or client timeouts!

2. **Fixed Supervisor Null Pointer Exception (`NoneType object has no attribute 'stdout'`)**:
   - **Root Cause**: In `supervisor.py`, `_read_stdout` and `_read_stderr` used `assert self._process and self._process.stdout`. If the worker process restarted or exited, `self._process` became `None`, throwing `AttributeError: 'NoneType' object has no attribute 'stdout'`.
   - **Fix**: Added explicit null checks `if not (self._process and self._process.stdout): return` and safe loop bounds `while self._process and self._process.stdout and (line := ...):`.

3. **Testing & Package**:
   - 50 unit tests passed cleanly with 0 errors.
   - Version bumped to `0.3.74` and built `paddle-formula-ocr.fpk`.
