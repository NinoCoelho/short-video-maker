# End-to-End Test Suite for Video Import Flow

This comprehensive E2E test suite validates the complete video import workflow from URL submission through final video rendering. The tests simulate real user interactions and verify the entire stack including frontend, backend, WebSocket communication, and video processing.

## 🎯 Test Coverage

### Core Test Suites

#### 1. **Basic Import Flow** (`video-import-flow.spec.ts`)
- Complete end-to-end workflow from URL to rendered video
- YouTube and direct video URL imports
- Settings configuration and validation
- Progress monitoring and completion verification
- Cross-browser compatibility

#### 2. **UI Interactions** (`ui-interactions.spec.ts`)
- Real-time URL validation with visual feedback
- Comprehensive settings form interactions
- Step navigation and state preservation
- Progress visualization and user feedback
- Responsive design across device sizes
- Keyboard navigation and accessibility

#### 3. **WebSocket Real-time Updates** (`websocket-updates.spec.ts`)
- WebSocket connection establishment and maintenance
- Real-time progress updates during import
- Connection error handling and recovery
- Multiple concurrent WebSocket connections
- Message parsing and error resilience

#### 4. **Batch Import & Concurrency** (`batch-import.spec.ts`)
- Multiple concurrent video imports
- Resource management under load
- Queue management and job prioritization
- UI responsiveness during batch operations
- Mixed success/failure scenario handling

#### 5. **Edge Cases** (`edge-cases.spec.ts`)
- Large video files (4K, long duration)
- Unusual video formats and platforms
- Network failures and interruptions
- Malformed URLs and invalid input
- Timeout scenarios and recovery
- Unicode and special characters in URLs
- Browser resource constraints

#### 6. **Error Recovery** (`error-recovery.spec.ts`)
- Graceful error handling throughout the flow
- User recovery options after errors
- Clear error messaging and guidance
- System stability after errors
- Retry mechanisms and fallback strategies
- Comprehensive error logging

## 🚀 Getting Started

### Prerequisites

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Install Playwright Browsers**
   ```bash
   npm run test:e2e:install
   ```

3. **Ensure Services are Running**
   ```bash
   # Terminal 1: Start backend server
   npm run dev:server
   
   # Terminal 2: Start frontend server
   npm run dev:ui
   ```

### Running Tests

#### Quick Start
```bash
# Run all E2E tests
npm run test:e2e:all

# Run specific test suite
npm run test:e2e:basic
npm run test:e2e:ui
npm run test:e2e:websocket
```

#### Browser-Specific Testing
```bash
# Test in Chrome only
npm run test:e2e:chrome

# Test in Firefox only
npm run test:e2e:firefox

# Test in Safari only (macOS)
npm run test:e2e:safari

# Test on mobile devices
npm run test:e2e:mobile
```

#### Development & Debugging
```bash
# Run tests in headed mode (visible browser)
npm run test:e2e:headed

# Run tests in debug mode with breakpoints
npm run test:e2e:debug

# Debug specific test pattern
npm run test:e2e:debug "URL validation"
```

#### Advanced Options
```bash
# Run with custom options
npm run test:e2e -- --workers=1 --timeout=60000 --retries=2

# Generate and view HTML report
npm run test:e2e:report
```

## 📊 Test Results & Reporting

### Automated Reports

After running tests, several reports are generated:

1. **HTML Report**: `test-results/e2e-html-report/index.html`
   - Interactive test results with screenshots
   - Test timeline and performance metrics
   - Failure analysis and stack traces

2. **JSON Report**: `test-results/e2e-results.json`
   - Machine-readable test results
   - Detailed timing and status information
   - Suitable for CI/CD integration

3. **JUnit Report**: `test-results/e2e-junit.xml`
   - Standard JUnit format for CI systems
   - Test case results and execution times

### Test Artifacts

- **Screenshots**: Captured on failures and key steps
- **Videos**: Full test execution recordings (on failures)
- **Traces**: Detailed execution traces for debugging
- **Network Logs**: API calls and responses
- **Console Logs**: Browser console output

All artifacts are stored in `test-results/e2e-artifacts/`

## 🏗️ Test Architecture

### Test Structure

```
tests/e2e/
├── setup/                     # Global setup and teardown
│   ├── global-setup.ts       # Test environment preparation
│   └── global-teardown.ts    # Cleanup and reporting
├── utils/                     # Test utilities and helpers
│   ├── test-helpers.ts       # Page object patterns
│   └── mock-server.ts        # API mocking utilities
├── fixtures/                  # Test data and fixtures
│   ├── videos/               # Mock video metadata
│   └── mock-responses/       # API response fixtures
└── *.spec.ts                 # Test specification files
```

### Key Components

#### **VideoImportTestHelper**
Provides high-level methods for common import workflow operations:
```typescript
const helper = new VideoImportTestHelper(page);
await helper.completeFullImportWorkflow(testVideo, settings);
```

#### **MockServerHelper**
Handles API mocking and external service simulation:
```typescript
const mockServer = new MockServerHelper(page);
await mockServer.setupVideoImportMocks('success');
await mockServer.mockExternalServices();
```

#### **WebSocketTestHelper**
Monitors and verifies WebSocket communication:
```typescript
const wsHelper = new WebSocketTestHelper(page);
const events = await wsHelper.waitForImportProgress(jobId);
```

## 🔧 Configuration

### Environment Variables

```bash
# Test environment
NODE_ENV=test

# Server configuration
PORT=3233
REMOTION_HOST=0.0.0.0

# Test-specific settings
MOCK_EXTERNAL_SERVICES=true
MOCK_VIDEO_DOWNLOADS=true
LOG_LEVEL=debug
WEBSOCKET_ENABLED=true
```

### Playwright Configuration

Key configuration options in `playwright.config.ts`:

```typescript
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 120000,              // 2 minutes per test
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  
  use: {
    baseURL: 'http://localhost:3232',
    actionTimeout: 30000,
    navigationTimeout: 60000,
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  }
});
```

## 🐛 Debugging Tests

### Common Issues

1. **Service Connection Errors**
   ```bash
   # Verify services are running
   curl http://localhost:3233/api/health
   curl http://localhost:3232
   ```

2. **WebSocket Connection Issues**
   - Check firewall settings
   - Verify WebSocket endpoint is accessible
   - Review browser console for connection errors

3. **Test Timeouts**
   - Increase timeout values for slow operations
   - Check system resource usage
   - Review network conditions

### Debug Mode

Run tests in debug mode for interactive debugging:

```bash
npm run test:e2e:debug "your test pattern"
```

Features in debug mode:
- Tests run in headed browsers
- Automatic pause on failures
- Browser developer tools available
- Step-by-step execution
- Console.log output visible

### Tracing & Analysis

Enable detailed tracing:

```bash
playwright test --trace on
```

Then analyze traces:
```bash
playwright show-trace test-results/trace.zip
```

## 📈 Performance Considerations

### Test Optimization

1. **Parallel Execution**: Tests run in parallel by default
2. **Smart Mocking**: External services are mocked to reduce dependencies
3. **Resource Management**: Automatic cleanup of test artifacts
4. **Selective Running**: Run specific test suites during development

### CI/CD Integration

The test suite is optimized for CI environments:

```yaml
# Example GitHub Actions workflow
- name: Run E2E Tests
  run: |
    npm run dev:server &
    npm run dev:ui &
    sleep 10  # Wait for services
    npm run test:e2e:all
```

### Performance Monitoring

Tests include performance assertions:
- Import completion times
- UI responsiveness during operations
- WebSocket message latency
- Resource usage patterns

## 📝 Writing New Tests

### Test Patterns

1. **Use Page Object Patterns**
   ```typescript
   const helper = new VideoImportTestHelper(page);
   await helper.navigateToImporter();
   ```

2. **Mock External Dependencies**
   ```typescript
   await mockServer.setupVideoImportMocks('success');
   ```

3. **Verify Real-time Updates**
   ```typescript
   const events = await wsHelper.waitForImportProgress(jobId);
   expect(events.length).toBeGreaterThan(0);
   ```

4. **Take Screenshots for Documentation**
   ```typescript
   await page.screenshot({ 
     path: 'test-results/e2e-artifacts/feature-screenshot.png' 
   });
   ```

### Best Practices

1. **Descriptive Test Names**: Use clear, specific test descriptions
2. **Independent Tests**: Each test should be self-contained
3. **Proper Cleanup**: Always clean up resources and state
4. **Error Scenarios**: Test both success and failure cases
5. **Cross-Browser Testing**: Verify compatibility across browsers
6. **Performance Awareness**: Include timing assertions where relevant

## 🔍 Monitoring & Maintenance

### Regular Maintenance Tasks

1. **Update Dependencies**: Keep Playwright and browsers current
2. **Review Test Flakiness**: Address intermittent failures
3. **Performance Regression**: Monitor test execution times
4. **Coverage Analysis**: Ensure comprehensive test coverage

### Metrics to Track

- Test execution time trends
- Failure rates by test suite
- Browser compatibility issues
- Performance regression detection

## 📚 Additional Resources

- [Playwright Documentation](https://playwright.dev/)
- [Test Strategy Guidelines](../../docs/testing-strategy.md)
- [Debugging Video Import Issues](../../docs/debugging-guide.md)
- [Performance Testing Guide](../../docs/performance-testing.md)

---

## 🆘 Support

If you encounter issues with the E2E test suite:

1. Check the [troubleshooting section](#-debugging-tests)
2. Review test artifacts in `test-results/`
3. Run individual test suites to isolate issues
4. Use debug mode for detailed investigation
5. Check browser console for JavaScript errors

For additional support, please refer to the project's main documentation or create an issue in the repository.