const { chromium } = require('playwright');
const https = require('https');
const fs = require('fs');
const path = require('path');

async function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        https.get(url, (response) => {
            if (response.statusCode === 301 || response.statusCode === 302) {
                downloadFile(response.headers.location, dest).then(resolve).catch(reject);
                return;
            }
            response.pipe(file);
            file.on('finish', () => {
                file.close();
                resolve();
            });
        }).on('error', (err) => {
            fs.unlink(dest, () => {});
            reject(err);
        });
    });
}

async function getLogos() {
    const browser = await chromium.launch();
    const page = await browser.newPage();

    console.log('Loading Gamma site...');
    await page.goto('https://talented-hires-8x1bqp0.gamma.site/', {
        waitUntil: 'networkidle',
        timeout: 60000
    });

    await page.waitForTimeout(5000);

    // Get ALL images including lazy loaded ones
    const allImages = await page.evaluate(() => {
        const results = [];

        // Get all img elements
        document.querySelectorAll('img').forEach((img, i) => {
            if (img.src) {
                results.push({
                    type: 'img',
                    src: img.src,
                    width: img.naturalWidth || img.width,
                    height: img.naturalHeight || img.height
                });
            }
        });

        // Get background images
        document.querySelectorAll('*').forEach(el => {
            const bg = window.getComputedStyle(el).backgroundImage;
            if (bg && bg !== 'none' && bg.includes('url(')) {
                const match = bg.match(/url\(["']?([^"')]+)["']?\)/);
                if (match && match[1]) {
                    results.push({
                        type: 'bg',
                        src: match[1]
                    });
                }
            }
        });

        return results;
    });

    console.log(`Found ${allImages.length} total images`);

    // Create images directory
    if (!fs.existsSync('images')) {
        fs.mkdirSync('images');
    }

    // Filter for logo-like images (gamma CDN URLs that are reasonable size)
    const logoImages = allImages.filter(img =>
        img.src.includes('gamma.app') &&
        !img.src.includes('theme_images') &&
        (img.type === 'img' || img.src.includes('height:400'))
    );

    console.log(`\nFiltered to ${logoImages.length} potential logo images:`);

    const companyNames = ['palantir', 'pienso', 'gsr', 'mersive', 'spacelift', 'insight', 'a16z', 'sequoia', 'khosla'];
    let logoIndex = 0;

    for (const img of logoImages) {
        if (logoIndex >= 9) break;

        const filename = `logo-${companyNames[logoIndex] || logoIndex}.png`;
        const dest = path.join('images', filename);

        try {
            console.log(`\nDownloading: ${img.src.substring(0, 100)}...`);
            await downloadFile(img.src, dest);

            // Check file size
            const stats = fs.statSync(dest);
            console.log(`  -> Saved as ${filename} (${stats.size} bytes)`);

            if (stats.size < 1000) {
                console.log(`  -> Too small, skipping`);
                fs.unlinkSync(dest);
            } else {
                logoIndex++;
            }
        } catch (err) {
            console.log(`  -> Failed: ${err.message}`);
        }
    }

    await browser.close();
    console.log('\n\nDownloaded logos. Listing images directory:');
}

getLogos().catch(console.error);
