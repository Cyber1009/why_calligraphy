// Global variables
let cv = null;
let currentImage = null;
let selectedBackground = 'original';
let isTeaPouring = false; // Track teapot pouring state

/**
 * Chinese Teapot Feature
 * ----------------------
 * This feature adds an interactive Chinese-style teapot to the top of the page.
 * When clicked, the teapot tilts and pours tea, creating a water ripple effect
 * that fills the entire page background.
 * 
 * Features:
 * - Animated teapot with steam effect
 * - Mouse-following teapot movement
 * - Tea drops with physics-based animation
 * - Splash effects when drops hit the surface
 * - Water ripple background effect
 */

// Background options - Traditional Chinese calligraphy inspired
const baseBackgroundOptions = [
    { name: '原图', value: 'original', color: 'transparent', isOriginal: true },
    { name: '雪白', value: 'default', color: '#ffffff' },
    { name: '宣纸', value: 'rice', color: '#faf8f3' },
    { name: '自定义', value: 'custom', color: '#f0f0f0', isCustom: true },
    // Commented out additional single color backgrounds
    // { name: 'Aged Parchment', value: 'parchment', color: '#f5f1e8' },
    // { name: 'Silk Scroll', value: 'silk', color: '#f7f3e9' },
    // { name: 'Bamboo Paper', value: 'bamboo', color: '#f2f0e6' },
    // { name: 'Tea Stained', value: 'tea', color: '#f0ede4' }
];

// Dynamic background options based on image aspect ratio
let backgroundOptions = [...baseBackgroundOptions];

// Store custom background image
let customBackgroundImage = null;

// Mobile detection function
function isMobileDevice() {
    return /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
           ('ontouchstart' in window) ||
           (navigator.maxTouchPoints > 0) ||
           (navigator.msMaxTouchPoints > 0);
}

// Wait for OpenCV to load
function onOpenCvReady() {
    cv = window.cv;
    initializeApp();
}

// Fallback initialization if OpenCV doesn't load
window.addEventListener('load', function() {
    // Wait a bit for OpenCV to potentially load
    setTimeout(function() {
        if (!cv && window.cv) {
            cv = window.cv;
            initializeApp();
        } else if (!cv) {
            initializeApp();
        }
    }, 2000);
});

function initializeApp() {
    // Preload all background images immediately
    preloadAllBackgroundImages();
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', async function() {
            setupEventListeners();
            // await populateBackgroundOptions();
        });
    } else {
        setupEventListeners();
        // populateBackgroundOptions(); // Initial call without aspect ratio
    }
}

function setupEventListeners() {
    // File input
    document.getElementById('imageInput').addEventListener('change', handleImageUpload);    
    
    // Custom background file input
    const customBackgroundInput = document.getElementById('customBackgroundInput');
    if (customBackgroundInput) {
        customBackgroundInput.addEventListener('change', handleCustomBackgroundUpload);
    }
    
    // Threshold slider with enhanced real-time performance
    const thresholdSlider = document.getElementById('thresholdSlider');
    let thresholdDebounceTimer = null;
    let isProcessing = false;
    
    // Detect if we're on a mobile device for different performance optimization
    const isMobile = isMobileDevice();
    
    // Real-time input handler for immediate visual feedback
    thresholdSlider.addEventListener('input', function() {
        document.getElementById('thresholdValue').textContent = this.value;
        
        if (currentImage && !isProcessing) {
            // For mobile: immediate lightweight update
            if (isMobile) {
                processImageRealtime();
            } else {
                // For desktop: minimal debouncing for smooth experience
                if (thresholdDebounceTimer) {
                    clearTimeout(thresholdDebounceTimer);
                }
                thresholdDebounceTimer = setTimeout(function() {
                    processImageRealtime();
                }, 20); // Very short delay for smooth desktop experience
            }
        }
    });
    
    // Additional change event for final processing to ensure accuracy
    thresholdSlider.addEventListener('change', function() {
        if (currentImage) {
            // Clear any pending debounced calls
            if (thresholdDebounceTimer) {
                clearTimeout(thresholdDebounceTimer);
                thresholdDebounceTimer = null;
            }
            // Perform final high-quality processing
            processImage();
        }
    });
    
    // Download button
    document.getElementById('downloadBtn').addEventListener('click', downloadResult);
    
    // Background selection
    document.addEventListener('click', function(e) {
        if (e.target.closest('.background-option')) {
            selectBackground(e.target.closest('.background-option'));
        }
    });
    
    // Enhanced zoom and drag functionality
    setupZoomAndDrag();
    
    // Window resize handler for mobile orientation changes
    window.addEventListener('resize', function() {
        if (currentImage) {
            updateContainerSize(currentImage);
        }
    });
      // Teapot click handler
    setupTeapot();
    
    // Teapot movement based on mouse position - DISABLED to keep teapot fixed
    // setupTeapotMovement();
}

// Configuration flag to enable/disable ultimate flexible scanning
const USE_ULTIMATE_FLEXIBLE_SCANNING = true; // Set to true to enable scanning of additional folders

// Enhanced file discovery function - attempts to find all image files in a folder
// Modify the discoverImageFiles function in app.js
function discoverImageFiles(folderPath) {
    // Use a predefined list for each folder instead of testing each file
    const knownImagesByFolder = {
        'background/paper/': ['卷轴.jpg', '宣纸2.jpg', '宣纸3.jpg', '宣纸4.jpg', '竹编.jpg'],
        'background/background_h/': ['水墨.jpg', '水墨2.jpg', '粉荷.jpg', '鲤鱼.jpg'], // Updated with actual files
        'background/background_v/': ['书卷.jpg', '水墨-竖.png', '水墨6.png'], // Updated with actual files
        'app_background/': ['background_bamboo.jpg', 'background_bamboo_2.jpg', 'background_bamboo_3.jpg', 'background_bamboo_4.jpg', 'boat.jpeg']
    };
    
    return Promise.resolve(knownImagesByFolder[folderPath] || []);
}
    

// Dynamic background options based on aspect ratio - scans filesystem
async function getDynamicBackgrounds(aspectRatio) {
    try {
        // Helper function to load backgrounds from a folder with enhanced discovery
        const loadBackgroundsFromFolder = async (folderPath, knownFiles = null) => {
            const backgrounds = [];
            
            // Use enhanced discovery if no known files provided, otherwise use known files
            const filesToTry = knownFiles || await discoverImageFiles(folderPath);
            
            for (const filename of filesToTry) {
                try {
                    const fullPath = folderPath + filename;
                    // Test if the image exists by trying to load it
                    const imageExists = await testImageExists(fullPath);
                    if (imageExists) {
                        // Convert filename to display name (remove extension and format)
                        const displayName = filename
                            .replace(/\.[^/.]+$/, '') // Remove extension
                            .replace(/[_-]/g, ' ')    // Replace underscores and hyphens with spaces
                            .replace(/\b\w/g, l => l.toUpperCase()); // Capitalize first letter of each word
                        
                        backgrounds.push({
                            name: displayName,
                            value: filename.replace(/\.[^/.]+$/, '').toLowerCase(),
                            imagePath: fullPath
                        });
                    }
                } catch (error) {
                    console.log(`Could not load ${filename} from ${folderPath}`);
                }
            }
            
            return backgrounds;
        };

        // Load backgrounds from different folders with enhanced discovery
        // For paper folder, we know the files, so we'll use the known list for speed
        const paperBackgrounds = await loadBackgroundsFromFolder('background/paper/', [
            '卷轴.jpg', '宣纸2.jpg', '宣纸3.jpg', '宣纸4.jpg', '竹编.jpg'
        ]);

        // For horizontal/vertical folders, use enhanced discovery to automatically find new files
        const horizontalBackgrounds = await loadBackgroundsFromFolder('background/background_h/');
        const verticalBackgrounds = await loadBackgroundsFromFolder('background/background_v/');

        if (aspectRatio > 1.3) {
            // Horizontal image - show paper + horizontal backgrounds
            return [...paperBackgrounds, ...horizontalBackgrounds];
        } else if (aspectRatio < 0.75) {
            // Vertical image - show paper + vertical backgrounds
            return [...paperBackgrounds, ...verticalBackgrounds];
        } else {
            // Square image - show all backgrounds
            return [...paperBackgrounds, ...horizontalBackgrounds, ...verticalBackgrounds];
        }
    } catch (error) {
        console.error('Error loading dynamic backgrounds:', error);
        // Fallback to basic hardcoded options if scanning fails
        return [
            { name: 'Aged Scroll', value: 'aged_scroll', imagePath: 'background/paper/aged_scroll.jpg' },
            { name: 'Bamboo Paper', value: 'bamboo_paper', imagePath: 'background/paper/bamboo_paper.jpg' }
        ];
    }
}

// Helper function to test if an image exists
function testImageExists(imagePath) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(true);
        img.onerror = () => resolve(false);
        img.src = imagePath;
    });
}

async function populateBackgroundOptions(aspectRatio = null) {
    const container = document.getElementById('backgroundSelect');
    container.innerHTML = '';
    
    // Reset to base options
    backgroundOptions = [...baseBackgroundOptions];
      // Add dynamic backgrounds based on aspect ratio
    if (aspectRatio !== null) {
        // Choose between standard and ultimate flexible scanning
        const dynamicBackgrounds = USE_ULTIMATE_FLEXIBLE_SCANNING 
            ? await getFlexibleBackgrounds(aspectRatio)
            : await getDynamicBackgrounds(aspectRatio);
        backgroundOptions = [...backgroundOptions, ...dynamicBackgrounds];
        
        // Debug: Log discovered backgrounds
        logDiscoveredBackgrounds(dynamicBackgrounds, aspectRatio);
    }
    
    backgroundOptions.forEach((bg, index) => {
        const option = document.createElement('div');
        option.className = `background-option ${index === 0 ? 'selected' : ''}`;
        option.dataset.bg = bg.value;
        
        const preview = document.createElement('div');
        preview.style.width = '50px';
        preview.style.height = '50px';
        preview.style.border = '1px solid #e8e6e0';
        preview.style.borderRadius = '6px';
        preview.className = 'background-preview';
        
        if (bg.isOriginal) {
            // Special styling for original option
            preview.style.background = 'linear-gradient(45deg, #f0f0f0 25%, transparent 25%), linear-gradient(-45deg, #f0f0f0 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #f0f0f0 75%), linear-gradient(-45deg, transparent 75%, #f0f0f0 75%)';
            preview.style.backgroundSize = '8px 8px';
            preview.style.backgroundPosition = '0 0, 0 4px, 4px -4px, -4px 0px';
            preview.innerHTML = '<div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 12px; color: #666;">📷</div>';
        } else if (bg.isCustom) {
            // Special styling for custom background upload option
            preview.style.background = 'linear-gradient(135deg, #e8dcc0 0%, #f0e8d8 100%)';
            preview.style.border = '2px dashed #8b7753';
            preview.style.cursor = 'pointer';
            preview.innerHTML = '<div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 20px; color: #666;">+</div>';
        } else if (bg.imagePath) {
            // Custom background image
            const img = document.createElement('img');
            img.src = bg.imagePath;
            img.style.width = '100%';
            img.style.height = '100%';
            img.style.objectFit = 'cover';
            img.style.borderRadius = '6px';
            img.onerror = function() {
                // Fallback to solid color if image fails to load
                preview.style.backgroundColor = bg.color || '#f5f1e8';
            };
            preview.appendChild(img);
        } else {
            preview.style.backgroundColor = bg.color;
        }
        
        const label = document.createElement('div');
        label.textContent = bg.name;
        label.className = 'background-label';
        
        option.appendChild(preview);
        option.appendChild(label);
        
        // Add special click handler for custom background option
        if (bg.isCustom) {
            option.style.cursor = 'pointer';
            option.addEventListener('click', function(e) {
                e.stopPropagation();
                document.getElementById('customBackgroundInput').click();
            });
        }
        
        container.appendChild(option);
    });
}

function selectBackground(option) {
    // Remove selected class from all options
    document.querySelectorAll('.background-option').forEach(opt => {
        opt.classList.remove('selected');
    });
    
    // Add selected class to clicked option
    option.classList.add('selected');
    selectedBackground = option.dataset.bg;
    
    // Update display based on selection
    if (currentImage) {
        if (selectedBackground === 'original') {
            // Show original image preview
            displayOriginalImage();
        } else if (selectedBackground === 'custom') {
            // Custom background - wait for image to be loaded via file input
            if (customBackgroundImage) {
                processImageRealtime();
            }
        } else {
            // Process image with selected background
            processImageRealtime(); // Lightweight real-time updates
        }
    }
}

function handleImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    // Validate file type
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg'];
    if (!allowedTypes.includes(file.type)) {
        showError('Please select a valid image file (PNG, JPG, JPEG)');
        return;
    }
      const reader = new FileReader();
    reader.onload = function(e) {        const img = new Image();
        img.onload = async function() {
            currentImage = img;            updateContainerSize(img);
            await displayImagePreview(img);
            hideError();

            showMainUIAfterImageUpload();
            
            // Auto-process on image load if not original background
            if (selectedBackground !== 'original') {
                processImage();
            }
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

/**
 * Handle custom background image upload
 * Allows users to upload their own background image
 * Auto-resizes to fit the calligraphy dimensions
 */
function handleCustomBackgroundUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    // Validate file type
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
        showError('Please select a valid image file (PNG, JPG, JPEG, GIF, WebP)');
        return;
    }
    
    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
        showError('Image file is too large. Please choose a file under 10MB.');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            // Store the custom background image
            customBackgroundImage = img;
            
            // Select custom background option
            const customOption = document.querySelector('.background-option[data-bg="custom"]');
            if (customOption) {
                selectBackground(customOption);
            }
            
            hideError();
            
            // Process the image with the new custom background
            if (currentImage) {
                processImageRealtime();
            }
        };
        img.onerror = function() {
            showError('Failed to load the background image. Please try another file.');
        };
        img.src = e.target.result;
    };
    reader.onerror = function() {
        showError('Error reading the background image file.');
    };
    reader.readAsDataURL(file);
}

// After image upload and preview is shown, reveal scroll panel, background selection, threshold section, and download button
function showMainUIAfterImageUpload() {
    document.querySelector('.scroll-panel').style.display = '';
    document.getElementById('backgroundSelect').style.display = '';
    
    // Show threshold section with flex display for the combined row layout
    const thresholdSection = document.getElementById('thresholdSection');
    if (thresholdSection) {
        thresholdSection.style.display = 'flex';
    }
    
    document.getElementById('downloadBtn').style.display = '';
}

// // Patch image upload logic to call showMainUIAfterImageUpload
// const imageInput = document.getElementById('imageInput');
// if (imageInput) {
//     imageInput.addEventListener('change', function(e) {
//         if (e.target.files && e.target.files.length > 0) {
//             // Wait for image preview to load, then show UI
//             setTimeout(showMainUIAfterImageUpload, 300);
//         }
//     });
// }

function updateContainerSize(img) {
    const container = document.querySelector('.canvas-container');
    if (!container || !img) return;
    
    // Calculate aspect ratio
    const aspectRatio = img.width / img.height;
    
    // Remove existing aspect ratio classes
    container.classList.remove('landscape', 'portrait', 'square');
    
    // Add appropriate class based on aspect ratio
    if (aspectRatio > 1.3) {
        container.classList.add('landscape');
    } else if (aspectRatio < 0.7) {
        container.classList.add('portrait');
    } else {
        container.classList.add('square');
    }
    
    // For mobile devices, adjust min-height more aggressively
    if (window.innerWidth <= 768) {
        if (aspectRatio > 1.5) {
            container.style.minHeight = '200px';
        } else if (aspectRatio < 0.6) {
            container.style.minHeight = '400px';
        } else {
            container.style.minHeight = '300px';
        }
    }
}

async function displayImagePreview(img) {
    const preview = document.getElementById('imagePreview');
    const canvas = document.getElementById('resultCanvas');
    const placeholder = document.getElementById('previewInstructions');
    
    preview.src = img.src;
    
    // Hide placeholder when image is loaded
    if (placeholder) {
        placeholder.style.display = 'none';
    }
    
    // Calculate aspect ratio and populate backgrounds accordingly
    const aspectRatio = img.width / img.height;
    await populateBackgroundOptions(aspectRatio);
    
    // Show appropriate preview based on selected background
    if (selectedBackground === 'original') {
        displayOriginalImage();
    } else {
        // For non-original backgrounds, we'll process and show canvas
        preview.style.display = 'none';
        canvas.style.display = 'none'; // Will be shown after processing
    }
    
    updateContainerSize(img);
    
    // // IMPORTANT: Re-setup zoom and drag events when image is displayed
    // setTimeout(() => {
    //     const preview = document.getElementById('imagePreview');
    //     const canvas = document.getElementById('resultCanvas');
        
    //     if (preview && preview.style.display !== 'none') {
    //         setupImageEvents(preview);
    //     }
    //     if (canvas && canvas.style.display !== 'none') {
    //         setupImageEvents(canvas);
    //     }
    // }, 100); // Small delay to ensure DOM is updated
}

function displayOriginalImage() {
    const preview = document.getElementById('imagePreview');
    const canvas = document.getElementById('resultCanvas');
    const placeholder = document.getElementById('previewInstructions');
    const downloadBtn = document.getElementById('downloadBtn');
    
    // Hide placeholder
    if (placeholder) {
        placeholder.style.display = 'none';
    }
    
    // Show original image, hide processed canvas
    preview.style.display = 'block';
    canvas.style.display = 'none';
    downloadBtn.style.display = 'inline-block'; // Allow download of original
    
    // IMPORTANT: Setup zoom events for the displayed image
    setTimeout(() => {
        setupImageEvents(preview);
    }, 50);
}

// Debounce function (kept for potential future use, but not used for threshold slider)
let processTimeout;
function debounceProcess() {
    clearTimeout(processTimeout);
    processTimeout = setTimeout(processImage, 300);
}

// Lightweight real-time processing without UI loading indicators
function processImageRealtime() {
    if (!cv || !currentImage) {
        return;
    }
    
    // If original is selected, just show the original image
    if (selectedBackground === 'original') {
        displayOriginalImage();
        return;
    }
    
    try {
        // Mobile performance optimization: reduce image size for processing
        const isMobile = isMobileDevice();
        let processWidth = currentImage.width;
        let processHeight = currentImage.height;
        
        // Scale down image for mobile processing to improve performance
        if (isMobile && (processWidth > 800 || processHeight > 800)) {
            const scale = Math.min(800 / processWidth, 800 / processHeight);
            processWidth = Math.floor(processWidth * scale);
            processHeight = Math.floor(processHeight * scale);
        }
        
        // Create canvas for input image
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = processWidth;
        canvas.height = processHeight;
        ctx.drawImage(currentImage, 0, 0, processWidth, processHeight);
        
        // Load image into OpenCV
        const src = cv.imread(canvas);
        const gray = new cv.Mat();
        const binary = new cv.Mat();
        
        // Convert to grayscale
        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
        
        // Apply threshold
        const threshValue = parseInt(document.getElementById('thresholdSlider').value);
        cv.threshold(gray, binary, threshValue, 255, cv.THRESH_BINARY_INV);
        
        // Mobile optimization: skip morphological operations for faster processing
        if (!isMobile) {
            // Remove small noise (morphological opening) - only on desktop
            const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(2, 2));
            cv.morphologyEx(binary, binary, cv.MORPH_OPEN, kernel, new cv.Point(-1, -1), 1);
            kernel.delete();
        }
        
        // Create result image with background (use original dimensions)
        const result = createBackgroundImage(currentImage.width, currentImage.height);
        
        // Scale binary mask back to original size if needed
        if (processWidth !== currentImage.width || processHeight !== currentImage.height) {
            const scaledBinary = new cv.Mat();
            cv.resize(binary, scaledBinary, new cv.Size(currentImage.width, currentImage.height), 0, 0, cv.INTER_NEAREST);
            applyCalligraphyToBackground(scaledBinary, result);
            scaledBinary.delete();
        } else {
            applyCalligraphyToBackground(binary, result);
        }
        
        // Display preview (this will switch from original to processed)
        displayResult(result);
        
        // Cleanup
        src.delete();
        gray.delete();
        binary.delete();
    } catch (error) {
        // Silently handle real-time processing errors
        // Don't show error UI for real-time updates
    }
}

function processImage() {
    if (!cv || !currentImage) {
        showError('OpenCV not loaded or no image selected');
        return;
    }
    
    // If original is selected, just show the original image
    if (selectedBackground === 'original') {
        displayOriginalImage();
        return;
    }
    
    showLoading();
    hideError();
    
    // Use setTimeout to allow UI to update
    setTimeout(() => {
        try {
            updateProgress(10, 'Preparing the canvas...');
            
            // Create canvas for input image
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = currentImage.width;
            canvas.height = currentImage.height;
            ctx.drawImage(currentImage, 0, 0);
            
            updateProgress(20, 'Reading the image essence...');
            
            // Load image into OpenCV
            const src = cv.imread(canvas);
            const gray = new cv.Mat();
            const binary = new cv.Mat();
            
            updateProgress(40, 'Converting to ink wash...');
            
            // Convert to grayscale
            cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
            
            updateProgress(60, 'Applying brush sensitivity...');
            
            // Apply threshold
            const threshValue = parseInt(document.getElementById('thresholdSlider').value);
            cv.threshold(gray, binary, threshValue, 255, cv.THRESH_BINARY_INV);
            
            updateProgress(70, 'Refining brush strokes...');
            
            // Remove small noise (morphological opening)
            const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(2, 2));
            cv.morphologyEx(binary, binary, cv.MORPH_OPEN, kernel, new cv.Point(-1, -1), 1);
            
            updateProgress(80, 'Preparing traditional paper...');
            
            // Create preview image with background
            const result = createBackgroundImage(canvas.width, canvas.height);
            
            updateProgress(90, 'Harmonizing ink and paper...');
            
            // Apply calligraphy to background
            applyCalligraphyToBackground(binary, result);
            
            updateProgress(100, 'Creating masterpiece...');
            
            // Display preview
            displayResult(result);
            
            // Cleanup
            src.delete();
            gray.delete();
            binary.delete();
            kernel.delete();
            
            hideLoading();
        } catch (error) {
            showError('Error processing image: ' + error.message);
            hideLoading();
        }
    }, 100);
}

function createBackgroundImage(width, height) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = width;
    canvas.height = height;
    
    // Handle original option - return original image as background
    if (selectedBackground === 'original') {
        ctx.drawImage(currentImage, 0, 0, width, height);
        return canvas;
    }
    
    // Handle custom uploaded background
    if (selectedBackground === 'custom') {
        if (customBackgroundImage) {
            ctx.drawImage(customBackgroundImage, 0, 0, width, height);
        } else {
            // Fallback to white if custom image not loaded
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, width, height);
        }
        return canvas;
    }
    
    // First, check if it's a predefined solid color background
    const bgOption = backgroundOptions.find(bg => bg.value === selectedBackground);
    if (bgOption && bgOption.color && !bgOption.imagePath) {
        // Use solid color background
        ctx.fillStyle = bgOption.color;
        ctx.fillRect(0, 0, width, height);
    } else if (bgOption && bgOption.imagePath) {
        // Try to load custom background image from imagePath
        const bgImg = document.querySelector(`.background-option[data-bg="${selectedBackground}"] img`);
        if (bgImg && bgImg.complete && bgImg.naturalWidth > 0) {
            // Custom background image found and loaded
            ctx.drawImage(bgImg, 0, 0, width, height);
        } else {
            // Fallback to white if image not loaded
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, width, height);
        }
    } else {
        // Try to load custom background image (legacy support)
        const bgImg = document.querySelector(`.background-option[data-bg="${selectedBackground}"] img`);
        if (bgImg && bgImg.complete && bgImg.naturalWidth > 0) {
            // Custom background image found and loaded
            ctx.drawImage(bgImg, 0, 0, width, height);
        } else {
            // Fallback to white background
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, width, height);
        }
    }
    
    return canvas;
}

function applyCalligraphyToBackground(binaryMat, backgroundCanvas) {
    const ctx = backgroundCanvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, backgroundCanvas.width, backgroundCanvas.height);
    const data = imageData.data;
    
    // Get binary image data
    const binaryData = binaryMat.data;
    const width = binaryMat.cols;
    const height = binaryMat.rows;
    
    // Apply calligraphy (set pixels to black where binary is white)
    for (let i = 0; i < height; i++) {
        for (let j = 0; j < width; j++) {
            const binaryIndex = i * width + j;
            const imageIndex = (i * width + j) * 4;
            
            if (binaryData[binaryIndex] === 255) { // White in binary = text
                data[imageIndex] = 0;     // R
                data[imageIndex + 1] = 0; // G
                data[imageIndex + 2] = 0; // B
                // Alpha remains unchanged
            }
        }
    }
    
    ctx.putImageData(imageData, 0, 0);
}

function displayResult(canvas) {
    const resultCanvas = document.getElementById('resultCanvas');
    const preview = document.getElementById('imagePreview');
    const placeholder = document.getElementById('previewInstructions');
    const ctx = resultCanvas.getContext('2d');
    
    resultCanvas.width = canvas.width;
    resultCanvas.height = canvas.height;
    ctx.drawImage(canvas, 0, 0);
    
    // Hide placeholder
    if (placeholder) {
        placeholder.style.display = 'none';
    }
    
    // Show processed canvas, hide original image
    resultCanvas.style.display = 'block';
    preview.style.display = 'none';
    
    document.getElementById('downloadBtn').style.display = 'inline-block';
    
    // IMPORTANT: Setup zoom events for the displayed canvas
    setTimeout(() => {
        setupImageEvents(resultCanvas);
    }, 50);
}

function downloadResult() {
    let canvas;
    
    if (selectedBackground === 'original') {
        // Create a canvas with the original image for download
        canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = currentImage.width;
        canvas.height = currentImage.height;
        ctx.drawImage(currentImage, 0, 0);
    } else {
        // Use the processed result canvas
        canvas = document.getElementById('resultCanvas');
    }
    
    if (!canvas) return;
    
    // Create download link with traditional naming
    canvas.toBlob(function(blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const suffix = selectedBackground === 'original' ? 'original' : 'ink_harmony';
        a.download = `${suffix}_${Date.now()}.jpg`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 'image/jpeg', 0.9);
}

function showLoading() {
    // document.getElementById('loadingSpinner').style.display = 'flex';
    // document.getElementById('progressContainer').style.display = 'block';
}

function hideLoading() {
    // document.getElementById('loadingSpinner').style.display = 'none';
    // document.getElementById('progressContainer').style.display = 'none';
}

function updateProgress(percent, text) {
    // const progressBar = document.getElementById('progressBar');
    // const progressText = document.getElementById('progressText');
    
    // progressBar.style.width = percent + '%';
    // progressText.textContent = text;
}

function showError(message) {
    const errorDiv = document.getElementById('errorMessage');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
}

function hideError() {
    const errorDiv = document.getElementById('errorMessage');
    errorDiv.style.display = 'none';
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    if (typeof cv !== 'undefined') {
        onOpenCvReady();
    }
});

// Enhanced zoom and drag functionality
function setupZoomAndDrag() {
    let isDragging = false;
    let startX = 0, startY = 0;
    let currentX = 0, currentY = 0;
    let initialTransform = { x: 0, y: 0 };
    
    // Make setupImageEvents globally accessible
    window.setupImageEvents = setupImageEvents;
    
    function setupImageEvents(element) {
        if (!element) {
            return;
        }

        // Check if element already has zoom events
        if (element.hasAttribute('data-zoom-setup')) {
            return;
        }
        
        let touchStartTime = 0;
        let touchMoved = false;
        let initialTouchPos = { x: 0, y: 0 };
        
        // Mark element as having zoom setup
        element.setAttribute('data-zoom-setup', 'true');
        
        // Prevent context menu on images for better drag experience
        element.addEventListener('contextmenu', function(e) {
            e.preventDefault();
        });
        
        // Click to zoom toggle (only for desktop or when no touch support)
        element.addEventListener('click', function(e) {
            // Only handle click if it's not a touch device OR it's a mouse click on mobile
            if (!isMobileDevice() || (e.detail && e.detail > 0)) {
                e.preventDefault();
                toggleZoom(element);
            }
        });
        
        // Mouse events for drag (desktop)
        element.addEventListener('mousedown', function(e) {
            // Only handle left mouse button
            if (e.button !== 0) return;
            
            if (element.classList.contains('zoomed')) {
                e.preventDefault();
                e.stopPropagation(); // Important for Chrome
                startDrag(e, element);
            }
        });
        
        // Touch events for mobile
        element.addEventListener('touchstart', function(e) {
            // Only handle single touches
            if (e.touches.length !== 1) return;
            
            const touch = e.touches[0];
            initialTouchPos = { x: touch.clientX, y: touch.clientY };
            touchStartTime = Date.now();
            touchMoved = false;
            
            // Only prevent default for zoomed images to avoid interfering with normal scrolling
            if (element.classList.contains('zoomed')) {
                e.preventDefault();
                startDrag(e, element);
            }
        }, { passive: false });
        
        element.addEventListener('touchmove', function(e) {
            if (e.touches.length !== 1) return;
            
            const touch = e.touches[0];
            const deltaX = Math.abs(touch.clientX - initialTouchPos.x);
            const deltaY = Math.abs(touch.clientY - initialTouchPos.y);
            
            // Mark as moved if movement is significant (more than 5 pixels)
            if (deltaX > 5 || deltaY > 5) {
                touchMoved = true;
            }
            
            // If we're dragging a zoomed image, handle the drag movement
            if (element.classList.contains('zoomed') && isDragging) {
                e.preventDefault();
                touchDrag(e);
            }
        }, { passive: false });
        
        element.addEventListener('touchend', function(e) {
            // Only handle single touch end
            if (e.changedTouches.length !== 1) return;
            
            const touchDuration = Date.now() - touchStartTime;
            
            // Stop any ongoing drag first
            if (isDragging) {
                stopDrag();
            }
            
            // Detect tap: quick touch (< 500ms) with minimal movement
            const isTap = touchDuration < 500 && !touchMoved;
            
            if (isTap) {
                e.preventDefault(); // Prevent ghost clicks
                toggleZoom(element);
            }
            
            // Reset touch state
            touchMoved = false;
            touchStartTime = 0;
            initialTouchPos = { x: 0, y: 0 };
        }, { passive: false });
        
        // Handle touch cancel (important for mobile)
        element.addEventListener('touchcancel', function(e) {
            touchMoved = false;
            touchStartTime = 0;
            initialTouchPos = { x: 0, y: 0 };
            
            // Stop any ongoing drag
            if (isDragging) {
                stopDrag();
            }
        }, { passive: false });
    }
    
    function toggleZoom(element) {
        if (element.classList.contains('zoomed')) {
            // Zoom out
            element.classList.remove('zoomed', 'dragging');
            element.style.transform = '';
            element.style.transformOrigin = 'center center';
            currentX = 0;
            currentY = 0;
        } else {
            // Zoom in
            element.classList.add('zoomed');
            element.style.transformOrigin = 'center center';
            element.style.transform = 'scale(2)';
        }
    }
    
    function startDrag(event, element) {
        isDragging = true;
        element.classList.add('dragging');
        
        // Get coordinates from either mouse or touch event
        let clientX, clientY;
        if (event.touches && event.touches.length > 0) {
            // Touch event
            clientX = event.touches[0].clientX;
            clientY = event.touches[0].clientY;
        } else {
            // Mouse event
            clientX = event.clientX;
            clientY = event.clientY;
        }
        
        startX = clientX - currentX;
        startY = clientY - currentY;

        // Mouse events
        document.addEventListener('mousemove', drag, { passive: false });
        document.addEventListener('mouseup', stopDrag);
        
        // Touch events
        document.addEventListener('touchmove', touchDrag, { passive: false });
        document.addEventListener('touchend', stopDrag);
        document.addEventListener('touchcancel', stopDrag);
    }
    
    function drag(e) {
        if (!isDragging) return;
        
        e.preventDefault();
        e.stopPropagation(); // Add for Chrome compatibility
        
        currentX = e.clientX - startX;
        currentY = e.clientY - startY;
        
        updateTransform();
    }
    
    function touchDrag(e) {
        if (!isDragging || e.touches.length !== 1) {
            return;
        }
        e.preventDefault();
        
        currentX = e.touches[0].clientX - startX;
        currentY = e.touches[0].clientY - startY;
        
        updateTransform();
    }    function updateTransform() {
        const elements = document.querySelectorAll('.zoomed');
        
        elements.forEach(element => {
            // Get the actual rendered dimensions (after CSS constraints)
            const elementRect = element.getBoundingClientRect();
            const containerRect = element.parentElement.getBoundingClientRect();
            
            // Use the ACTUAL rendered size before scaling
            const renderedWidth = elementRect.width;
            const renderedHeight = elementRect.height;
            
            // For a 2x scaled image, to see all edges we need to move by:
            // - Half the rendered size to see the "overflow" edges
            // - Plus the full rendered size to see the "opposite" edges
            // This means we need bounds equal to the full rendered dimensions
            
            const maxX = Math.max(200, renderedWidth);
            const maxY = Math.max(200, renderedHeight);
            
            const boundedX = Math.max(-maxX, Math.min(maxX, currentX));
            const boundedY = Math.max(-maxY, Math.min(maxY, currentY));
            
            const transformString = `scale(2) translate(${boundedX / 2}px, ${boundedY / 2}px)`;
            element.style.transform = transformString;
            
            // Debug info (remove this after testing)
            console.log('Drag bounds:', { maxX, maxY, currentX, currentY, boundedX, boundedY, renderedWidth, renderedHeight });
        });
    }
    
    function stopDrag() {
        if (!isDragging) return;
        
        isDragging = false;
        document.querySelectorAll('.dragging').forEach(el => {
            el.classList.remove('dragging');
        });
        
        // Remove event listeners
        document.removeEventListener('mousemove', drag);
        document.removeEventListener('mouseup', stopDrag);
        document.removeEventListener('touchmove', touchDrag);
        document.removeEventListener('touchend', stopDrag);
        document.removeEventListener('touchcancel', stopDrag);
    }

    // Click/Touch outside to zoom out
    function handleOutsideInteraction(e) {
        const zoomedElements = document.querySelectorAll('.zoomed');
        if (zoomedElements.length > 0 && !e.target.closest('canvas, .preview-image')) {
            zoomedElements.forEach(element => {
                element.classList.remove('zoomed', 'dragging');
                element.style.transform = '';
                element.style.transformOrigin = 'center center';
            });
            currentX = 0;
            currentY = 0;
        }
    }

    document.addEventListener('click', handleOutsideInteraction);
    document.addEventListener('touchend', function(e) {
        // Only handle if it's a single touch that ended
        if (e.changedTouches.length === 1) {
            handleOutsideInteraction(e);
        }
    });

    // // Setup events for existing elements
    // const imagePreview = document.getElementById('imagePreview');
    // const resultCanvas = document.getElementById('resultCanvas');
    
    // setupImageEvents(imagePreview);
    // setupImageEvents(resultCanvas);

    // Observer to setup events for dynamically created elements
    const observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            mutation.addedNodes.forEach(function(node) {
                if (node.nodeType === 1) { // Element node
                    if (node.matches('canvas, .preview-image')) {
                        setupImageEvents(node);
                    }
                    // Also check children
                    const images = node.querySelectorAll && node.querySelectorAll('canvas, .preview-image');
                    if (images) {
                        images.forEach(setupImageEvents);
                    }
                }
            });
        });
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
}

// Teapot setup and event handling
function setupTeapot() {
    const teapot = document.getElementById('teapot');
    const teapotElement = teapot.querySelector('.teapot');
    const rippleContainer = document.getElementById('rippleContainer');
    const steamContainer = teapot.querySelector('.steam-container');
    
    // Create teapot element if it doesn't exist
    if (!teapotElement) {
        const newTeapot = document.createElement('div');
        newTeapot.className = 'teapot';
        teapot.appendChild(newTeapot);
    }
    
    // Create steam container if it doesn't exist
    if (!steamContainer) {
        const newSteamContainer = document.createElement('div');
        newSteamContainer.className = 'steam-container';
        for (let i = 1; i <= 3; i++) {
            const steam = document.createElement('div');
            steam.className = `steam steam-${i}`;
            newSteamContainer.appendChild(steam);
        }
        teapot.appendChild(newSteamContainer);
    }
    
    teapot.addEventListener('click', function() {
        if (isTeaPouring) return; // Prevent multiple clicks while animation is running
        isTeaPouring = true;
        
        // Mark as clicked to hide any hints
        teapot.classList.add('clicked');
        
        // Enhanced steam hiding with fade effect
        if (steamContainer) {
            steamContainer.style.transition = 'opacity 0.5s ease';
            steamContainer.style.opacity = '0';
        }
        
        // Start pouring animation with improved timing
        const actualTeapot = teapot.querySelector('.teapot');
        if (actualTeapot) {
            actualTeapot.classList.add('pouring');
        }
        
        // Create tea drops with optimized delay
        setTimeout(() => {
            createTeaDrops(teapot);
        }, 400);
        
        // Show ripple container with enhanced timing
        setTimeout(() => {
            rippleContainer.classList.add('active');
            createRipples();
        }, 1000);
          // Reset after animation completes with extended duration
        setTimeout(() => {
            if (actualTeapot) {
                actualTeapot.classList.remove('pouring');
            }
            isTeaPouring = false;
            
            // Show steam again with fade in
            if (steamContainer) {
                steamContainer.style.transition = 'opacity 1s ease';
                steamContainer.style.opacity = '0.7';
            }
            
            // Display birthday greeting after tea pouring effect
            showBirthdayGreeting();
        }, 7000);
        
        // Reset ripples after a longer delay for better effect
        setTimeout(() => {
            rippleContainer.classList.remove('active');
            // Gradual cleanup instead of immediate
            setTimeout(() => {
                rippleContainer.innerHTML = '';
            }, 2000);
        }, 10000);
    });
    
    // Add subtle pulse animation after page load to attract attention
    setTimeout(() => {
        if (!teapot.classList.contains('clicked')) {
            teapot.style.animation = 'teapotPulse 4s infinite ease-in-out';
        }
    }, 3000);
}

// Add teapot follow movement
function setupTeapotMovement() {
    const teapot = document.getElementById('teapot');
    let isMoving = false;
    
    // DISABLED - Add subtle movement to teapot based on mouse position
    /*
    document.addEventListener('mousemove', function(e) {
        if (isTeaPouring) return; // Don't move while pouring
        
        // Calculate rotation based on mouse position
        const maxRotation = 8;
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;
        
        // Map mouse position to rotation angles
        const rotateY = maxRotation * (0.5 - (e.clientX / windowWidth));
        const rotateX = maxRotation * (0.5 - (e.clientY / windowHeight));
        
        // Apply subtle rotation if not actively pouring
        if (!isMoving) {
            isMoving = true;
            teapot.style.transition = 'transform 2s ease';
            teapot.style.transform = `perspective(1000px) rotateY(${rotateY}deg) rotateX(${rotateX}deg)`;
            
            setTimeout(() => {
                isMoving = false;
            }, 100);
        }
    });
    */
}

function createTeaDrops(teapot) {
    const teapotRect = teapot.getBoundingClientRect();
    // Adjust spout position - teapot spout should be on the right side of the teapot
    const startX = teapotRect.left + (teapotRect.width * 0.85); // 85% across the width (right side)
    const startY = teapotRect.top + (teapotRect.height * 0.75); // 75% down from top (lower position)
    
    // Calculate landing area with more natural spread
    const landingY = startY + Math.min(280, window.innerHeight * 0.3);
    
    // Create more drops with varied timing for natural flow
    for (let i = 0; i < 20; i++) {
        setTimeout(() => {
            const drop = document.createElement('div');
            drop.className = 'tea-drop';
            drop.style.left = `${startX}px`;
            drop.style.top = `${startY}px`;
            
            // Enhanced physics - more natural variation
            const randomOffset = Math.random() * 45 + 20; // Wider spread
            const randomSize = 6 + Math.random() * 6; // More size variation
            const windEffect = Math.sin(i * 0.3) * 10; // Subtle wind effect
            
            drop.style.width = `${randomSize}px`;
            drop.style.height = `${randomSize * 1.4}px`;
            drop.style.transform = `translateX(${randomOffset + windEffect}px)`;
            
            document.body.appendChild(drop);
            
            // Enhanced physics animation
            requestAnimationFrame(() => {
                const fallDuration = 1.0 + Math.random() * 0.6; // More varied timing
                drop.style.transition = `all ${fallDuration}s cubic-bezier(0.25, 0.46, 0.45, 0.94)`;
                drop.style.animation = `drop-fall ${fallDuration}s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards`;
                drop.style.opacity = '0.8';
                
                // Create splash effect with improved timing
                setTimeout(() => {
                    const landingX = startX + randomOffset + windEffect + (i * 1.5);
                    createSplash(landingX, landingY);
                }, fallDuration * 1000 * 0.92);
            });
            
            // Cleanup
            setTimeout(() => {
                if (document.body.contains(drop)) {
                    document.body.removeChild(drop);
                }
            }, 2500);
        }, i * 90 + Math.random() * 40); // More natural timing variation
    }
}

// Enhanced splash effect with better ripple creation
function createSplash(x, y) {
    const rippleContainer = document.getElementById('rippleContainer');
    const isRippleActive = rippleContainer.classList.contains('active');
    
    // Only create splash if ripple container is active
    if (!isRippleActive) return;
    
    const splash = document.createElement('div');
    splash.className = 'splash';
    splash.style.left = `${x}px`;
    splash.style.top = `${y}px`;
    document.body.appendChild(splash);
    
    // Create multiple ripples for more realistic effect
    const rippleCount = Math.random() > 0.4 ? 2 : 1; // Sometimes create multiple ripples
    
    for (let i = 0; i < rippleCount; i++) {
        setTimeout(() => {
            const ripple = document.createElement('div');
            ripple.className = 'ripple';
            
            // Position relative to ripple container
            const containerRect = rippleContainer.getBoundingClientRect();
            const relativeX = ((x - containerRect.left) / containerRect.width) * 100;
            const relativeY = ((y - containerRect.top) / containerRect.height) * 100;
            
            // Add slight variation for multiple ripples
            const offsetX = i * (Math.random() * 4 - 2);
            const offsetY = i * (Math.random() * 4 - 2);
            
            ripple.style.left = `${Math.max(0, Math.min(100, relativeX + offsetX))}%`;
            ripple.style.top = `${Math.max(0, Math.min(100, relativeY + offsetY))}%`;
            
            // Enhanced ripple sizing
            const baseSize = 12 + Math.random() * 25;
            const sizeMultiplier = i === 0 ? 1 : 0.7; // Secondary ripples are smaller
            ripple.style.width = `${baseSize * sizeMultiplier}px`;
            ripple.style.height = `${baseSize * sizeMultiplier}px`;
            
            // More varied animation timing
            const duration = 1.5 + Math.random() * 1.8;
            ripple.style.animationDuration = `${duration}s`;
            ripple.style.animationDelay = `${i * 0.1}s`;
            
            // Enhanced opacity variation
            const opacity = (0.5 + Math.random() * 0.4) * (i === 0 ? 1 : 0.6);
            const teaColor = getComputedStyle(document.documentElement).getPropertyValue('--tea-drop-color').trim();
            
            if (teaColor.startsWith('rgba')) {
                const colorValues = teaColor.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*[\d.]+\)/);
                if (colorValues) {
                    ripple.style.backgroundColor = `rgba(${colorValues[1]}, ${colorValues[2]}, ${colorValues[3]}, ${opacity})`;
                }
            } else {
                ripple.style.backgroundColor = `rgba(173, 115, 38, ${opacity})`;
            }
            
            rippleContainer.appendChild(ripple);
            
            // Remove the ripple after animation
            setTimeout(() => {
                if (ripple.parentNode === rippleContainer) {
                    rippleContainer.removeChild(ripple);
                }
            }, (duration + 0.2) * 1000);
        }, i * 50); // Stagger multiple ripples
    }
    
    // Remove the splash after animation completes
    setTimeout(() => {
        if (document.body.contains(splash)) {
            document.body.removeChild(splash);
        }
    }, 1200);
}

function createRipples() {
    const rippleContainer = document.getElementById('rippleContainer');
    rippleContainer.innerHTML = '';
    
    // Create more varied initial ripples
    for (let i = 0; i < 12; i++) {
        setTimeout(() => {
            createRipple();
        }, i * 200 + Math.random() * 100); // More varied timing
    }
    
    // Continue creating ripples with varying intervals
    let intervalCount = 0;
    const rippleInterval = setInterval(() => {
        if (intervalCount < 15) { // Create more ripples over time
            createRipple();
            // Occasionally create a burst of ripples
            if (Math.random() > 0.7) {
                setTimeout(() => createRipple(), 100);
                setTimeout(() => createRipple(), 200);
            }
        }
        intervalCount++;
    }, 400 + Math.random() * 300); // More varied timing
    
    // Stop creating ripples after extended time
    setTimeout(() => {
        clearInterval(rippleInterval);
    }, 8000);
}

function createRipple() {
    const rippleContainer = document.getElementById('rippleContainer');
    const ripple = document.createElement('div');
    ripple.className = 'ripple';
    
    // More natural positioning - avoid edges
    const margin = 10;
    const x = margin + Math.random() * (100 - 2 * margin);
    const y = margin + Math.random() * (100 - 2 * margin);
    ripple.style.left = `${x}%`;
    ripple.style.top = `${y}%`;
    
    // More varied sizing
    const size = 25 + Math.random() * 120;
    ripple.style.width = `${size}px`;
    ripple.style.height = `${size}px`;
    
    // Enhanced animation timing
    const duration = 2.5 + Math.random() * 2.5;
    ripple.style.animationDuration = `${duration}s`;
    
    // Add slight delay for more natural effect
    const delay = Math.random() * 0.5;
    ripple.style.animationDelay = `${delay}s`;
    
    // Enhanced opacity and color variation
    const opacity = 0.2 + Math.random() * 0.4;
    const teaColor = getComputedStyle(document.documentElement).getPropertyValue('--tea-drop-color').trim();
    
    // Use the base tea color with adjusted opacity
    if (teaColor.startsWith('rgba')) {
        const colorValues = teaColor.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*[\d.]+\)/);
        if (colorValues) {
            // Add slight color variation for more natural look
            const r = Math.max(0, Math.min(255, parseInt(colorValues[1]) + (Math.random() * 20 - 10)));
            const g = Math.max(0, Math.min(255, parseInt(colorValues[2]) + (Math.random() * 15 - 7)));
            const b = Math.max(0, Math.min(255, parseInt(colorValues[3]) + (Math.random() * 10 - 5)));
            ripple.style.backgroundColor = `rgba(${r}, ${g}, ${b}, ${opacity})`;
        }
    } else {
        ripple.style.backgroundColor = `rgba(173, 115, 38, ${opacity})`;
    }
    
    rippleContainer.appendChild(ripple);
    
    // Remove the ripple after animation
    setTimeout(() => {
        if (ripple.parentNode === rippleContainer) {
            rippleContainer.removeChild(ripple);
        }
    }, (duration + delay + 0.5) * 1000);
}

// Ultimate flexible background system - scans multiple potential folders
async function getFlexibleBackgrounds(aspectRatio) {
    try {
        // Define potential background folders to scan
        const backgroundFolders = [
            { path: 'background/paper/', category: 'paper', forAllAspects: true },
            { path: 'background/background_h/', category: 'horizontal', forHorizontal: true, forSquare: true },
            { path: 'background/background_v/', category: 'vertical', forVertical: true, forSquare: true },
            { path: 'app_background/', category: 'additional', forAllAspects: true }, // Scan additional folder
            { path: 'backup/', category: 'backup', forAllAspects: false } // Optional backup folder
        ];

        const allBackgrounds = [];        for (const folder of backgroundFolders) {
            // Determine if this folder should be included based on aspect ratio
            let shouldInclude = false;
            if (folder.forAllAspects) {
                shouldInclude = true;
            } else if (aspectRatio > 1.3 && folder.forHorizontal) {
                shouldInclude = true;
            } else if (aspectRatio < 0.75 && folder.forVertical) {
                shouldInclude = true;
            } else if (aspectRatio >= 0.75 && aspectRatio <= 1.3 && folder.forSquare) {
                shouldInclude = true;
            }

            if (shouldInclude) {
                try {
                    // Use the enhanced discovery system for ultimate flexibility
                    const folderBackgrounds = await loadBackgroundsFromFolderFlexible(folder.path);
                    // Limit additional folders to prevent overwhelming the UI
                    if (folder.category === 'additional' && folderBackgrounds.length > 5) {
                        folderBackgrounds.splice(5); // Keep only first 5 from additional folders
                    }
                    allBackgrounds.push(...folderBackgrounds);
                } catch (error) {
                    console.log(`Could not scan folder ${folder.path}:`, error);
                }
            }
        }

        return allBackgrounds;
    } catch (error) {
        console.error('Error in flexible background system:', error);
        return await getDynamicBackgrounds(aspectRatio); // Fallback to standard system
    }
}

// Debug function to log discovered backgrounds
function logDiscoveredBackgrounds(backgrounds, aspectRatio) {
    console.log(`🎨 Discovered ${backgrounds.length} backgrounds for aspect ratio ${aspectRatio.toFixed(2)}:`);
    backgrounds.forEach((bg, index) => {
        console.log(`  ${index + 1}. ${bg.name} (${bg.imagePath})`);
    });
}

// Helper function to load backgrounds from a folder (used by flexible background system)
async function loadBackgroundsFromFolder(folderPath, knownFiles = null) {
    const backgrounds = [];
    
    // Use enhanced discovery if no known files provided, otherwise use known files
    const filesToTry = knownFiles || await discoverImageFiles(folderPath);
    
    for (const filename of filesToTry) {
        try {
            const fullPath = folderPath + filename;
            // Test if the image exists by trying to load it
            const imageExists = await testImageExists(fullPath);
            if (imageExists) {
                // Convert filename to display name (remove extension and format)
                const displayName = filename
                    .replace(/\.[^/.]+$/, '') // Remove extension
                    .replace(/[_-]/g, ' ')    // Replace underscores and hyphens with spaces
                    .replace(/\b\w/g, l => l.toUpperCase()); // Capitalize first letter of each word
                
                backgrounds.push({
                    name: displayName,
                    value: filename.replace(/\.[^/.]+$/, '').toLowerCase(),
                    imagePath: fullPath
                });
            }
        } catch (error) {
            console.log(`Could not load ${filename} from ${folderPath}`);
        }
    }
    
    return backgrounds;
}

// Flexible background loader that uses enhanced discovery
async function loadBackgroundsFromFolderFlexible(folderPath) {
    const backgrounds = [];
    
    // Use enhanced discovery to find all potential images
    const discoveredFiles = await discoverImageFiles(folderPath);
    
    for (const filename of discoveredFiles) {
        try {
            const fullPath = folderPath + filename;
            // Convert filename to display name (remove extension and format)
            const displayName = filename
                .replace(/\.[^/.]+$/, '') // Remove extension
                .replace(/[_-]/g, ' ')    // Replace underscores and hyphens with spaces
                .replace(/\b\w/g, l => l.toUpperCase()); // Capitalize first letter of each word
            
            backgrounds.push({
                name: displayName,
                value: filename.replace(/\.[^/.]+$/, '').toLowerCase(),
                imagePath: fullPath
            });
        } catch (error) {
            console.log(`Could not process ${filename} from ${folderPath}`);
        }
    }
    
    return backgrounds;
}

// Birthday greeting function
function showBirthdayGreeting() {
    // Find the title element
    const titleElement = document.querySelector('h1');
    if (!titleElement) return;
    
    // Store the original title text
    const originalText = titleElement.textContent;
    
    // Temporarily replace title with birthday greeting
    titleElement.textContent = '生日快乐 :)';
    
    // Restore original title after 5 seconds
    setTimeout(() => {
        titleElement.textContent = originalText;
    }, 5000);
}

// Preload all images in the /background folder and subfolders
function preloadAllBackgroundImages() {
    const imagePaths = [
        'background/paper/竹编.jpg',
        'background/paper/宣纸4.jpg',
        'background/paper/宣纸3.jpg',
        'background/paper/宣纸2.jpg',
        'background/paper/卷轴.jpg',
        'background/background_v/水墨6.png',
        'background/background_v/水墨-竖.png',
        'background/background_v/书卷.jpg',
        'background/background_h/鲤鱼.jpg',
        'background/background_h/粉荷.jpg',
        'background/background_h/水墨2.jpg',
        'background/background_h/水墨.jpg',
        'app_background/boat.jpeg'
    ];
    imagePaths.forEach(path => {
        const img = new Image();
        img.src = path;
    });
}
