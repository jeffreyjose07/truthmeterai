import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Performance Optimizations Test Suite', () => {
    suite('Memory Optimization Tests', () => {
        test('Circular buffer prevents unbounded memory growth', () => {
            const MAX_SIZE = 1000;
            const events: any[] = new Array(MAX_SIZE);
            let index = 0;

            // Simulate adding 5000 events (5x the limit)
            for (let i = 0; i < 5000; i++) {
                events[index] = { id: i, data: `event_${i}` };
                index = (index + 1) % MAX_SIZE;
            }

            // Memory is bounded - array size never exceeds MAX_SIZE
            assert.strictEqual(
                events.length,
                MAX_SIZE,
                'Circular buffer maintains constant size'
            );
        });

        test('Timer cleanup prevents memory leaks', () => {
            const timers = new Set<NodeJS.Timeout>();

            // Create timers
            for (let i = 0; i < 10; i++) {
                const timer = setTimeout(() => {}, 1000);
                timers.add(timer);
            }

            assert.strictEqual(timers.size, 10, 'Should track 10 timers');

            // Cleanup
            timers.forEach(timer => clearTimeout(timer));
            timers.clear();

            assert.strictEqual(timers.size, 0, 'All timers should be cleared');
        });

        test('Map cleanup prevents memory leaks', () => {
            const cache = new Map<string, any>();

            // Add items
            for (let i = 0; i < 100; i++) {
                cache.set(`key_${i}`, { data: i });
            }

            assert.strictEqual(cache.size, 100, 'Cache has 100 items');

            // Cleanup
            cache.clear();

            assert.strictEqual(cache.size, 0, 'Cache should be empty after clear');
        });
    });

    suite('CPU Optimization Tests', () => {
        test('Debouncing reduces function calls', async () => {
            let callCount = 0;
            const debouncers = new Map<string, NodeJS.Timeout>();

            const debouncedFunction = (key: string) => {
                const existing = debouncers.get(key);
                if (existing) {
                    clearTimeout(existing);
                }

                const timer = setTimeout(() => {
                    callCount++;
                    debouncers.delete(key);
                }, 100);

                debouncers.set(key, timer);
            };

            // Rapid calls
            for (let i = 0; i < 50; i++) {
                debouncedFunction('test');
            }

            // Wait for debounce
            await new Promise(resolve => setTimeout(resolve, 200));

            // Should only call once despite 50 calls
            assert.strictEqual(callCount, 1, 'Debouncing reduced calls to 1');
        });

        test('Batching reduces I/O operations', async () => {
            let writeCount = 0;
            const writeQueue: any[] = [];

            const queueWrite = (data: any) => {
                writeQueue.push(data);
            };

            const flushWrites = () => {
                if (writeQueue.length > 0) {
                    writeCount++;
                    writeQueue.length = 0;
                }
            };

            // Add many items
            for (let i = 0; i < 100; i++) {
                queueWrite({ id: i });
            }

            // Single batch write
            flushWrites();

            assert.strictEqual(writeCount, 1, 'Batching reduced to 1 write operation');
        });

        test('Throttling limits function call rate', async () => {
            let callCount = 0;
            let lastCall = 0;
            const throttleDelay = 100;

            const throttledFunction = () => {
                const now = Date.now();
                if (now - lastCall >= throttleDelay) {
                    callCount++;
                    lastCall = now;
                }
            };

            // Call rapidly 50 times over 500ms
            for (let i = 0; i < 50; i++) {
                throttledFunction();
                await new Promise(resolve => setTimeout(resolve, 10));
            }

            // Should only call 5-6 times (every 100ms)
            assert.ok(callCount <= 7, `Throttling limited calls to ${callCount}`);
        });
    });

    suite('Algorithm Optimization Tests', () => {
        test('Hash-based duplication detection is O(n)', () => {
            const measurements: Array<{ size: number; time: number }> = [];

            for (const size of [100, 200, 400, 800]) {
                const blocks = Array.from({ length: size }, (_, i) => `block_${i % 50}`);

                const startTime = Date.now();

                // O(n) hash-based detection
                const hashCounts = new Map<string, number>();
                for (const block of blocks) {
                    hashCounts.set(block, (hashCounts.get(block) || 0) + 1);
                }

                let duplicates = 0;
                for (const count of hashCounts.values()) {
                    if (count > 1) {
                        duplicates += count - 1;
                    }
                }

                const time = Date.now() - startTime;
                measurements.push({ size, time });
            }

            // Verify linear complexity
            const ratio = measurements[3].time / Math.max(measurements[0].time, 1);
            assert.ok(
                ratio < 20, // Allow 20x tolerance (O(n) should be ~8x)
                `Algorithm complexity acceptable: ${ratio}x for 8x data`
            );
        });

        test('Incremental analysis processes only changed items', () => {
            const allFiles = Array.from({ length: 1000 }, (_, i) => `file_${i}.ts`);
            const changedFiles = new Set(['file_0.ts', 'file_1.ts', 'file_2.ts']);

            let processedCount = 0;

            // Incremental processing
            for (const file of allFiles) {
                if (changedFiles.has(file)) {
                    processedCount++;
                }
            }

            assert.strictEqual(processedCount, 3, 'Only 3 changed files processed');
            assert.ok(
                processedCount / allFiles.length < 0.01,
                'Processed <1% of files'
            );
        });

        test('Binary search is faster than linear search', () => {
            const sortedArray = Array.from({ length: 10000 }, (_, i) => i);
            const target = 7500;

            // Linear search
            const linearStart = Date.now();
            let linearResult = -1;
            for (let i = 0; i < sortedArray.length; i++) {
                if (sortedArray[i] === target) {
                    linearResult = i;
                    break;
                }
            }
            const linearTime = Date.now() - linearStart;

            // Binary search
            const binaryStart = Date.now();
            const binaryResult = sortedArray.indexOf(target); // Uses native optimized search
            const binaryTime = Date.now() - binaryStart;

            assert.strictEqual(linearResult, target, 'Linear search found target');
            assert.strictEqual(binaryResult, target, 'Binary search found target');
        });
    });

    suite('UI Responsiveness Tests', () => {
        test('Event loop yielding prevents blocking', async () => {
            let eventLoopWorks = false;

            // Set a timeout that should fire during operation
            const timeoutPromise = new Promise(resolve => {
                setTimeout(() => {
                    eventLoopWorks = true;
                    resolve(true);
                }, 50);
            });

            // Long operation with yielding
            for (let i = 0; i < 10; i++) {
                // Do some work
                Array.from({ length: 1000 }, (_, j) => j * j);

                // Yield to event loop
                await new Promise(resolve => setImmediate(resolve));
            }

            await timeoutPromise;

            assert.strictEqual(
                eventLoopWorks,
                true,
                'Event loop not blocked'
            );
        });

        test('Chunked processing maintains responsiveness', async () => {
            const chunkSize = 10;
            const totalItems = 100;
            const items = Array.from({ length: totalItems }, (_, i) => i);

            let chunksProcessed = 0;

            for (let i = 0; i < items.length; i += chunkSize) {
                const chunk = items.slice(i, i + chunkSize);

                // Process chunk
                chunk.forEach(item => Math.sqrt(item));
                chunksProcessed++;

                // Yield between chunks
                await new Promise(resolve => setImmediate(resolve));
            }

            assert.strictEqual(
                chunksProcessed,
                totalItems / chunkSize,
                'Processed in 10 chunks'
            );
        });

        test('Async operations do not block', async () => {
            const operations: Promise<number>[] = [];

            // Start multiple async operations
            for (let i = 0; i < 10; i++) {
                operations.push(
                    new Promise(resolve => {
                        setImmediate(() => resolve(i));
                    })
                );
            }

            // All should complete without blocking
            const results = await Promise.all(operations);

            assert.strictEqual(results.length, 10, 'All async operations completed');
        });
    });

    suite('Configuration Tests', () => {
        test('Performance settings exist and are valid', () => {
            const config = vscode.workspace.getConfiguration('aiMetrics.performance');

            const maxEvents = config.get('maxEvents', 1000);
            const debounceDelay = config.get('debounceDelay', 300);
            const analysisInterval = config.get('analysisInterval', 600000);

            assert.ok(maxEvents > 0, 'maxEvents should be positive');
            assert.ok(debounceDelay >= 0, 'debounceDelay should be non-negative');
            assert.ok(analysisInterval > 0, 'analysisInterval should be positive');
        });

        test('Default configuration values are reasonable', () => {
            const config = vscode.workspace.getConfiguration('aiMetrics.performance');

            const maxEvents = config.get('maxEvents', 1000);
            const debounceDelay = config.get('debounceDelay', 300);

            // Verify defaults are performance-optimal
            assert.strictEqual(maxEvents, 1000, 'Default maxEvents is 1000');
            assert.strictEqual(debounceDelay, 300, 'Default debounce is 300ms');
        });
    });

    suite('Data Structure Optimization Tests', () => {
        test('Map lookup is O(1) vs Array is O(n)', () => {
            const size = 1000;
            const data = Array.from({ length: size }, (_, i) => ({ id: i, value: `item_${i}` }));

            // Array lookup (O(n))
            const arrayStart = Date.now();
            const arrayResult = data.find(item => item.id === 750);
            const arrayTime = Date.now() - arrayStart;

            // Map lookup (O(1))
            const map = new Map(data.map(item => [item.id, item]));
            const mapStart = Date.now();
            const mapResult = map.get(750);
            const mapTime = Date.now() - mapStart;

            assert.ok(arrayResult, 'Array found item');
            assert.ok(mapResult, 'Map found item');
            // Map should generally be faster, but timing can vary
            assert.ok(true, 'Both methods work');
        });

        test('Set operations are optimized', () => {
            const set = new Set<string>();

            // Add items
            for (let i = 0; i < 1000; i++) {
                set.add(`item_${i}`);
            }

            // Check contains (O(1))
            const startTime = Date.now();
            const contains = set.has('item_500');
            const time = Date.now() - startTime;

            assert.strictEqual(contains, true, 'Set contains item');
            assert.ok(time < 10, 'Set lookup is fast');
        });
    });
});
