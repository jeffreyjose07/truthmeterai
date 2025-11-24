import * as assert from 'assert';
import { Logger } from '../../utils/Logger';
import { LicenseManager } from '../../auth/LicenseManager';

suite('Logger Test Suite', () => {
    let logger: Logger;

    setup(() => {
        logger = new Logger();
    });

    teardown(() => {
        logger.dispose();
    });

    test('should initialize without errors', () => {
        assert.ok(logger);
    });

    test('should log info messages', () => {
        logger.info('Test info message');
        // Should not throw
        assert.ok(true);
    });

    test('should log error messages', () => {
        logger.error('Test error message');
        // Should not throw
        assert.ok(true);
    });

    test('should log error with error object', () => {
        const error = new Error('Test error');
        logger.error('Error occurred', error);
        // Should not throw
        assert.ok(true);
    });

    test('should log warning messages', () => {
        logger.warn('Test warning message');
        // Should not throw
        assert.ok(true);
    });

    test('should log debug messages', () => {
        logger.debug('Test debug message');
        // Should not throw
        assert.ok(true);
    });

    test('should show output channel', () => {
        logger.show();
        // Should not throw
        assert.ok(true);
    });

    test('should handle dispose', () => {
        logger.dispose();
        // Should not throw
        assert.ok(true);
    });

    test('should handle multiple log calls', () => {
        logger.info('Message 1');
        logger.info('Message 2');
        logger.warn('Warning 1');
        logger.error('Error 1');
        logger.debug('Debug 1');
        // Should not throw
        assert.ok(true);
    });
});

suite('LicenseManager Test Suite', () => {
    let licenseManager: LicenseManager;

    setup(() => {
        licenseManager = new LicenseManager();
    });

    test('should initialize without errors', () => {
        assert.ok(licenseManager);
    });

    test('should check license', async () => {
        const isLicensed = await licenseManager.checkLicense();
        assert.strictEqual(typeof isLicensed, 'boolean');
    });

    test('should get license info', async () => {
        const info = await licenseManager.getLicenseInfo();

        assert.ok(info);
        assert.strictEqual(typeof info.isLicensed, 'boolean');
        assert.ok(['free', 'team', 'enterprise'].includes(info.tier));
    });

    test('should validate license key', async () => {
        const isValid = await licenseManager.validateLicenseKey('test-key');
        assert.strictEqual(typeof isValid, 'boolean');
    });

    test('should reject empty license key', async () => {
        const isValid = await licenseManager.validateLicenseKey('');
        assert.strictEqual(isValid, false);
    });

    test('should activate license', async () => {
        const activated = await licenseManager.activateLicense('test-key');
        assert.strictEqual(typeof activated, 'boolean');
    });

    test('should return free tier by default', async () => {
        const info = await licenseManager.getLicenseInfo();
        assert.strictEqual(info.tier, 'free');
    });

    test('should allow free access', async () => {
        const isLicensed = await licenseManager.checkLicense();
        assert.strictEqual(isLicensed, true);
    });
});
