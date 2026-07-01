const API_URL = 'https://script.google.com/macros/s/AKfycbzAXbuROmepx2ZwMM3vyj3wOivE5EOVlbsn59KAosQZPn3qoB0mFIgVWu-TeuJht3j1ng/exec';
const DEFAULT_IMAGE = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="720" height="960" viewBox="0 0 720 960"%3E%3Crect width="720" height="960" fill="%23F5EFE6"/%3E%3Ctext x="50%25" y="48%25" dominant-baseline="middle" text-anchor="middle" font-family="Arial, sans-serif" font-size="32" fill="%23A67D5A"%3EImage+Not+Available%3C/text%3E%3C/svg%3E';

function extractDriveFileId(url) {
    if (!url || typeof url !== 'string') return '';
    const match = url.match(/(?:id=|file\/d\/|\/d\/|\/document\/d\/)([\w-]+)/);
    return match ? match[1] : '';
}

function buildCdnImageUrl(fileId, width = 1200) {
    if (!fileId) return '';
    // FIXED: Corrected interpolation syntax and upgraded to secure Drive thumbnail endpoint
    return `https://drive.google.com/thumbnail?id=${fileId}&sz=w${width}`;
}

function buildDirectDriveUrl(fileId) {
    if (!fileId) return '';
    return `https://drive.google.com/uc?export=view&id=${fileId}`;
}

function normalizeImageUrl(url) {
    if (!url || typeof url !== 'string') return '';

    const trimmed = url.trim();
    if (!trimmed) return '';

    if (trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
        return trimmed;
    }

    const lower = trimmed.toLowerCase();
    if (lower.includes('googleusercontent.com') || lower.includes('photos.app.goo.gl')) {
        return trimmed;
    }

    if (lower.includes('drive.google.com/thumbnail')) {
        const fileId = extractDriveFileId(trimmed);
        return fileId ? buildCdnImageUrl(fileId, 1200) : trimmed;
    }

    if (lower.includes('drive.google.com') || lower.includes('docs.google.com')) {
        const fileId = extractDriveFileId(trimmed);
        if (fileId) {
            return buildCdnImageUrl(fileId, 1200);
        }
    }

    try {
        const parsed = new URL(trimmed);
        if (parsed.hostname.includes('drive.google.com') || parsed.hostname.includes('docs.google.com')) {
            const fileId = extractDriveFileId(trimmed);
            if (fileId) {
                return buildCdnImageUrl(fileId, 1200);
            }
        }
        return trimmed;
    } catch (e) {
        return trimmed;
    }
}

function getProductImageSources(product, { detail = false } = {}) {
    const width = detail ? 2000 : 800;
    const fileId = product.imageId || extractDriveFileId(product.imageLink) || extractDriveFileId(product.thumbnail);
    const cdnUrl = fileId ? buildCdnImageUrl(fileId, width) : '';
    const directDriveUrl = fileId ? buildDirectDriveUrl(fileId) : '';
    const sources = [
        cdnUrl,
        directDriveUrl,
        product.imageLink,
        product.thumbnail,
        DEFAULT_IMAGE
    ];

    return sources.filter((url, index) => url && sources.indexOf(url) === index);
}

function applyProductImage(img, product, options = {}) {
    const sources = getProductImageSources(product, options);
    let attempt = 0;

    img.onerror = () => {
        attempt += 1;
        if (attempt < sources.length) {
            img.src = sources[attempt];
            return;
        }
        img.onerror = null;
    };

    img.src = sources[0] || DEFAULT_IMAGE;
}

function sortProductsByPrice(products) {
    return [...products].sort((a, b) => (a.price || 0) - (b.price || 0));
}

// State
let allProducts = [];
let filteredProducts = [];
let wishlist = JSON.parse(localStorage.getItem('kalamkariWishlist')) || [];
let currentProduct = null;
let isDetailZoomed = false;
let isOverlayZoomed = false;

// DOM Elements
const views = {
    catalogue: document.getElementById('catalogue-view'),
    details: document.getElementById('product-details-view'),
    wishlist: document.getElementById('wishlist-view')
};

const elements = {
    productGrid: document.getElementById('product-grid'),
    wishlistGrid: document.getElementById('wishlist-grid'),
    spinner: document.getElementById('loading-spinner'),
    searchInput: document.getElementById('search-input'),
    filtersContainer: document.getElementById('category-filters') || document.querySelector('.category-filters'),
    wishlistCount: document.getElementById('wishlist-count'),
    viewWishlistBtn: document.getElementById('view-wishlist-btn'),
    backToCatalogueBtn: document.getElementById('back-to-catalogue'),
    backFromWishlistBtn: document.getElementById('back-from-wishlist'),
    emptyWishlistMsg: document.getElementById('empty-wishlist'),
    
    // Details View Elements
    detailImage: document.getElementById('detail-image'),
    detailImageSection: document.querySelector('.product-image-section'),
    overlay: document.getElementById('image-overlay'),
    overlayImage: document.getElementById('overlay-image'),
    overlayClose: document.getElementById('overlay-close'),
    detailCode: document.getElementById('detail-code'),
    detailTitle: document.getElementById('detail-title'),
    detailDescription: document.getElementById('detail-description'),
    detailPrice: document.getElementById('detail-price'),
    detailFabricHighlight: document.getElementById('detail-fabric-highlight'),
    addToWishlistBtn: document.getElementById('add-to-wishlist-btn'),
    wishlistBtnText: document.getElementById('wishlist-btn-text')
};

// Initialize
async function init() {
    updateWishlistCount();
    setupEventListeners();
    await fetchProducts();
    renderFilterButtons();
}

// Fetch Data
async function fetchProducts() {
    try {
        const response = await fetch(API_URL);
        const data = await response.json();
        
        const getFieldValue = (item, keys) => {
            for (const key of keys) {
                const value = item[key];
                if (value !== undefined && value !== null && String(value).trim()) {
                    return String(value);
                }
            }
            return '';
        };

        // Clean and prepare data
        allProducts = data.map(item => {
            const imageId = String(item['image id'] || item.imageId || '').trim();
            const rawImageLink = String(item['image link'] || item.imageLink || '').trim();
            const rawThumbnail = String(item.thumbnail || item[''] || '').trim();
            const imageLink = (imageId ? buildCdnImageUrl(imageId, 1200) : '') ||
                normalizeImageUrl(rawImageLink) ||
                (imageId ? buildDirectDriveUrl(imageId) : '');
            const thumbnail = (imageId ? buildCdnImageUrl(imageId, 800) : '') ||
                normalizeImageUrl(rawThumbnail) ||
                imageLink;

            function parsePrice(val) {
                if (val === undefined || val === null || String(val).trim() === '') return 0;
                const cleaned = String(val).replace(/[^0-9.\-]/g, '');
                const n = Number(cleaned);
                return isNaN(n) ? 0 : n;
            }

            return {
                code: String(item.code || '').trim(),
                fabric: String(item.fabric || 'Pure Silk').trim(),
                price: parsePrice(item.price || item.Price || ''),
                qty: Number(item.qty) || 0,
                imageId,
                imageLink,
                thumbnail,
                description: String(getFieldValue(item, [
                    'description',
                    'Description',
                    'product description',
                    'Product Description',
                    'desc',
                    'Desc'
                ])).trim()
            };
        }).filter(item => item.code);

        allProducts = sortProductsByPrice(allProducts);
        filteredProducts = sortProductsByPrice(allProducts);

        wishlist = wishlist.map(savedItem => {
            const freshItem = allProducts.find(p => p.code === savedItem.code);
            return freshItem || savedItem;
        });
        localStorage.setItem('kalamkariWishlist', JSON.stringify(wishlist));
        updateWishlistCount();

        elements.spinner.style.display = 'none';
        renderFilterButtons();
        renderProducts(filteredProducts, elements.productGrid);
        calculatePriceRanges();
    } catch (error) {
        console.error('Error fetching data:', error);
        elements.spinner.textContent = 'Failed to load collection. Please try again later.';
    }
}

// Render Product Grid
function renderProducts(products, container) {
    container.innerHTML = '';
    
    if (products.length === 0) {
        container.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: var(--text-muted);">No products found matching your criteria.</p>';
        return;
    }
    
    products.forEach(product => {
        const card = document.createElement('div');
        card.className = 'product-card';
        if (product.qty > 0) {
            card.onclick = () => showProductDetails(product);
        } else {
            card.classList.add('sold-out');
        }

        const formattedPrice = new Intl.NumberFormat('en-IN').format(product.price);

        const imageWrapper = document.createElement('div');
        imageWrapper.className = 'product-image-wrapper';

        const img = document.createElement('img');
        img.alt = product.fabric;
        img.loading = 'lazy';
        applyProductImage(img, product);

        imageWrapper.appendChild(img);

        if (product.qty <= 0) {
            const badge = document.createElement('span');
            badge.className = 'sold-out-badge';
            badge.textContent = 'SOLD OUT';
            imageWrapper.appendChild(badge);
        }

        const info = document.createElement('div');
        info.className = 'product-info';
        const shortDescription = product.description ? `${String(product.description).trim().slice(0, 120)}${product.description.length > 120 ? '...' : ''}` : '';
        info.innerHTML = `
    <h3 class="product-title">${product.fabric}</h3>
    ${shortDescription ? `<p class="product-card-description">${shortDescription}</p>` : ''}
    <div class="product-price">₹${formattedPrice}</div>
`;

        card.appendChild(imageWrapper);
        card.appendChild(info);
        container.appendChild(card);
    });
}

// Render Similar Products with 30% Price Range fallback
function renderSimilarProducts(currentProduct) {
    const similarSection = document.getElementById('similar-products-section');
    const similarContainer = document.getElementById('similar-products-grid');
    if (!similarSection || !similarContainer) return;

    let similar = allProducts.filter(p => 
        p.fabric.toLowerCase() === currentProduct.fabric.toLowerCase() && 
        p.code !== currentProduct.code
    );

    let higherPriced = similar
        .filter(p => p.price > currentProduct.price)
        .sort((a, b) => a.price - b.price);

    if (higherPriced.length === 0) {
        const minPrice = currentProduct.price * 0.7;
        const maxPrice = currentProduct.price * 1.3;
        higherPriced = allProducts.filter(p => 
            p.code !== currentProduct.code && 
            p.price >= minPrice && 
            p.price <= maxPrice
        ).sort((a, b) => a.price - b.price);
    }

    if (higherPriced.length > 0) {
        similarSection.style.display = 'block';
        renderProducts(higherPriced.slice(0, 4), similarContainer);
    } else {
        similarSection.style.display = 'none';
    }
}

// Navigation & Views
function showView(viewName) {
    Object.values(views).forEach(v => v.classList.remove('active'));
    views[viewName].classList.add('active');
    
    if (viewName === 'details') {
        document.body.classList.add('details-mode');
    } else {
        document.body.classList.remove('details-mode');
        window.scrollTo(0, 0);
    }
}

function renderFilterButtons() {
    elements.filtersContainer = elements.filtersContainer || document.getElementById('category-filters') || document.querySelector('.category-filters');
    if (!elements.filtersContainer) return;

    const fabricMap = new Map();
    allProducts.forEach(product => {
        const fabric = product.fabric ? product.fabric.trim() : 'Unknown';
        if (!fabric) return;

        const key = fabric.toLowerCase().replace(/\s+/g, ' ').trim();
        if (!fabricMap.has(key)) {
            fabricMap.set(key, { label: fabric, prices: [] });
        }
        fabricMap.get(key).prices.push(product.price || 0);
    });

    elements.filtersContainer.innerHTML = '';

    const allButton = document.createElement('button');
    allButton.className = 'filter-btn active';
    allButton.dataset.filter = 'all';
    allButton.innerHTML = '<span class="filter-title">ALL SAREES</span>';
    elements.filtersContainer.appendChild(allButton);

    fabricMap.forEach((entry, key) => {
        const prices = entry.prices.filter(price => price > 0);
        const priceText = prices.length > 0 ? formatPriceRange(prices) : 'Price Unavailable';

        const button = document.createElement('button');
        button.className = 'filter-btn';
        button.dataset.filter = key;
        button.innerHTML = `
            <span class="filter-title">${entry.label.toUpperCase()}</span>
            <span class="filter-price">${priceText}</span>
        `;
        elements.filtersContainer.appendChild(button);
    });

    attachFilterHandlers();
}

function attachFilterHandlers() {
    if (!elements.filtersContainer) return;
    const buttons = elements.filtersContainer.querySelectorAll('.filter-btn');
    buttons.forEach(btn => {
        btn.addEventListener('click', () => {
            buttons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            filterAndSearchProducts();
        });
    });
}

function formatPriceRange(prices) {
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const formatOpts = { style: 'currency', currency: 'INR', maximumFractionDigits: 0 };
    const formattedMin = new Intl.NumberFormat('en-IN', formatOpts).format(minPrice);
    const formattedMax = new Intl.NumberFormat('en-IN', formatOpts).format(maxPrice);
    return minPrice === maxPrice ? formattedMin : `${formattedMin} to ${formattedMax}`;
}

function showProductDetails(product) {
    currentProduct = product;
    isDetailZoomed = false;
    updateDetailZoom();
    
    applyProductImage(elements.detailImage, product, { detail: true });
    
    elements.detailCode.textContent = `Code: ${product.code}`;
    elements.detailTitle.textContent = product.fabric;
    
    if (product.description) {
        elements.detailDescription.textContent = product.description;
        elements.detailDescription.style.display = 'block';
    } else {
        elements.detailDescription.style.display = 'none';
    }
    
    elements.detailPrice.textContent = new Intl.NumberFormat('en-IN').format(product.price);
    elements.detailFabricHighlight.textContent = product.fabric;
    elements.detailImage.title = 'Click to zoom';
    
    updateWishlistButtonState();
    renderSimilarProducts(product);
    showView('details');
    
    window.scrollTo({ top: 0, behavior: 'smooth' }); 
}

function updateDetailZoom() {
    if (!elements.detailImageSection || !elements.detailImage) return;

    if (isDetailZoomed) {
        elements.detailImageSection.classList.add('zoom-active');
        elements.detailImage.style.transformOrigin = '50% 50%';
    } else {
        elements.detailImageSection.classList.remove('zoom-active');
        elements.detailImage.style.transformOrigin = '50% 50%';
    }
}

function toggleDetailZoom() {
    if (!currentProduct) return;
    isDetailZoomed = !isDetailZoomed;
    updateDetailZoom();
}

function moveDetailZoom(event) {
    if (!isDetailZoomed || !elements.detailImage) return;
    const rect = elements.detailImage.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    elements.detailImage.style.transformOrigin = `${x}% ${y}%`;
}

function openFullScreenImage(product) {
    if (!product || !elements.overlay || !elements.overlayImage) return;

    applyProductImage(elements.overlayImage, product, { detail: true });
    elements.overlayImage.style.transform = 'scale(1)';
    elements.overlayImage.style.transformOrigin = '50% 50%';
    elements.overlayImage.style.cursor = 'zoom-in';
    elements.overlay.classList.remove('hidden');
    isOverlayZoomed = false;
    document.body.style.overflow = 'hidden';
}

function closeOverlay() {
    if (!elements.overlay) return;

    elements.overlay.classList.add('hidden');
    if (elements.overlayImage) {
        elements.overlayImage.style.transform = 'scale(1)';
        elements.overlayImage.style.transformOrigin = '50% 50%';
        elements.overlayImage.style.cursor = 'zoom-in';
    }
    isOverlayZoomed = false;
    document.body.style.overflow = '';
}

function toggleOverlayZoom() {
    if (!elements.overlayImage) return;

    isOverlayZoomed = !isOverlayZoomed;
    if (isOverlayZoomed) {
        elements.overlayImage.style.transform = 'scale(2.5)';
        elements.overlayImage.style.cursor = 'zoom-out';
    } else {
        elements.overlayImage.style.transform = 'scale(1)';
        elements.overlayImage.style.transformOrigin = '50% 50%';
        elements.overlayImage.style.cursor = 'zoom-in';
    }
}

function moveOverlayZoom(event) {
    if (!isOverlayZoomed || !elements.overlayImage) return;
    const rect = elements.overlayImage.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    elements.overlayImage.style.transformOrigin = `${x}% ${y}%`;
}

function calculatePriceRanges() {
    const categories = {
        'kanchipuram': 'pure kanchipuram silk',
        'ikkat': 'pure ikkat  silk', 
        'gadwal': 'pure gadwal silk',
        'tussar': 'pure tussar silk'
    };
    
    for (const [id, fabricName] of Object.entries(categories)) {
        const categoryProducts = allProducts.filter(p => p.fabric && p.fabric.toLowerCase() === fabricName.toLowerCase());
        
        const priceElement = document.getElementById(`price-${id}`);
        if (!priceElement) continue;
        
        if (categoryProducts.length > 0) {
            const prices = categoryProducts.map(p => p.price).filter(p => p > 0);
            if (prices.length > 0) {
                const minPrice = Math.min(...prices);
                const maxPrice = Math.max(...prices);
                
                const formatOpts = { style: 'currency', currency: 'INR', maximumFractionDigits: 0 };
                const formattedMin = new Intl.NumberFormat('en-IN', formatOpts).format(minPrice);
                const formattedMax = new Intl.NumberFormat('en-IN', formatOpts).format(maxPrice);
                
                if (minPrice === maxPrice) {
                    priceElement.textContent = formattedMin;
                } else {
                    priceElement.textContent = `${formattedMin} to ${formattedMax}`;
                }
            } else {
                priceElement.textContent = 'Price Unavailable';
            }
        } else {
            priceElement.textContent = 'Out of Stock';
        }
    }
}

// Wishlist Functionality
function toggleWishlist() {
    if (!currentProduct) return;
    
    const index = wishlist.findIndex(item => item.code === currentProduct.code);
    
    if (index === -1) {
        wishlist.push(currentProduct);
    } else {
        wishlist.splice(index, 1);
    }
    
    try {
        localStorage.setItem('kalamkariWishlist', JSON.stringify(wishlist));
    } catch (e) {
        console.error("Error saving wishlist to local storage", e);
    }
    
    updateWishlistCount();
    updateWishlistButtonState();
}

function updateWishlistCount() {
    elements.wishlistCount.textContent = wishlist.length;
}

function updateWishlistButtonState() {
    if (!currentProduct) return;
    
    const isInWishlist = wishlist.some(item => item.code === currentProduct.code);
    
    if (isInWishlist) {
        elements.addToWishlistBtn.classList.add('active');
        elements.wishlistBtnText.textContent = 'Remove from Wishlist';
    } else {
        elements.addToWishlistBtn.classList.remove('active');
        elements.wishlistBtnText.textContent = 'Add to Wishlist';
    }
}

function renderWishlist() {
    renderProducts(wishlist, elements.wishlistGrid);
    
    if (wishlist.length === 0) {
        elements.emptyWishlistMsg.style.display = 'block';
    } else {
        elements.emptyWishlistMsg.style.display = 'none';
    }
}

// Search and Filter
function filterAndSearchProducts() {
    // FIX: Safely check if searchInput exists in HTML before accessing .value
    const searchTerm = elements.searchInput ? elements.searchInput.value.toLowerCase().trim() : '';
    const activeFilterBtn = document.querySelector('.filter-btn.active');
    const filterTerm = activeFilterBtn ? activeFilterBtn.dataset.filter.toLowerCase().trim() : 'all';
    
    filteredProducts = allProducts.filter(product => {
        const matchesSearch = !searchTerm ? true : (
            (product.code && product.code.toLowerCase().includes(searchTerm)) ||
            (product.fabric && product.fabric.toLowerCase().includes(searchTerm)) ||
            (product.price && product.price.toString().includes(searchTerm))
        );
            
        let matchesFilter = true;
        if (filterTerm !== 'all') {
            const prodFabric = product.fabric ? product.fabric.toLowerCase().replace(/\s+/g, ' ').trim() : '';
            const fTerm = filterTerm.replace(/\s+/g, ' ').trim();
            matchesFilter = prodFabric.includes(fTerm);
        }
        
        return matchesSearch && matchesFilter;
    });
    
    renderProducts(filteredProducts, elements.productGrid);
}

// Event Listeners
function setupEventListeners() {
    elements.backToCatalogueBtn.addEventListener('click', () => showView('catalogue'));
    elements.backFromWishlistBtn.addEventListener('click', () => showView('catalogue'));
    
    elements.viewWishlistBtn.addEventListener('click', () => {
        renderWishlist();
        showView('wishlist');
    });
    
    elements.addToWishlistBtn.addEventListener('click', toggleWishlist);
    
    if (elements.searchInput) {
        elements.searchInput.addEventListener('input', filterAndSearchProducts);
    }
    
    elements.detailImage.addEventListener('click', () => openFullScreenImage(currentProduct));
    
    if (elements.overlay) {
        elements.overlay.addEventListener('click', event => {
            if (event.target === elements.overlay || event.target === elements.overlayClose) {
                closeOverlay();
            }
        });
    }
    if (elements.overlayImage) {
        elements.overlayImage.addEventListener('click', toggleOverlayZoom);
        elements.overlayImage.addEventListener('mousemove', moveOverlayZoom);
    }
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') closeOverlay();
    });
}

// Boot up
document.addEventListener('DOMContentLoaded', init);