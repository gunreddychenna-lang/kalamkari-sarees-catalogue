const API_URL = 'https://script.google.com/macros/s/AKfycbzAXbuROmepx2ZwMM3vyj3wOivE5EOVlbsn59KAosQZPn3qoB0mFIgVWu-TeuJht3j1ng/exec';
const DEFAULT_IMAGE = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="720" height="960" viewBox="0 0 720 960"%3E%3Crect width="720" height="960" fill="%23F5EFE6"/%3E%3Ctext x="50%25" y="48%25" dominant-baseline="middle" text-anchor="middle" font-family="Arial, sans-serif" font-size="32" fill="%23A67D5A"%3EImage+Not+Available%3C/text%3E%3C/svg%3E';

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

    if (lower.includes('drive.google.com/thumbnail') || lower.includes('drive.google.com/uc?export=view&id=')) {
        return trimmed;
    }

    if (lower.includes('drive.google.com') || lower.includes('docs.google.com')) {
        const idMatch = trimmed.match(/(?:id=|file\/d\/|\/d\/|\/document\/d\/)([\w-]+)/);
        if (idMatch && idMatch[1]) {
            return `https://drive.google.com/uc?export=view&id=${idMatch[1]}`;
        }
    }

    try {
        const parsed = new URL(trimmed);
        if (parsed.hostname.includes('drive.google.com') || parsed.hostname.includes('docs.google.com')) {
            const idMatch = trimmed.match(/(?:id=|file\/d\/|\/d\/|\/document\/d\/)([\w-]+)/);
            if (idMatch && idMatch[1]) {
                return `https://drive.google.com/uc?export=view&id=${idMatch[1]}`;
            }
        }
        return trimmed;
    } catch (e) {
        return trimmed;
    }
}

function sortProductsByPrice(products) {
    return [...products].sort((a, b) => (a.price || 0) - (b.price || 0));
}

// State
let allProducts = [];
let filteredProducts = [];
let wishlist = JSON.parse(localStorage.getItem('kalamkariWishlist')) || [];
let currentProduct = null;

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
    filterBtns: document.querySelectorAll('.filter-btn'),
    wishlistCount: document.getElementById('wishlist-count'),
    viewWishlistBtn: document.getElementById('view-wishlist-btn'),
    backToCatalogueBtn: document.getElementById('back-to-catalogue'),
    backFromWishlistBtn: document.getElementById('back-from-wishlist'),
    emptyWishlistMsg: document.getElementById('empty-wishlist'),
    
    // Details View Elements
    detailImage: document.getElementById('detail-image'),
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
}

// Fetch Data
async function fetchProducts() {
    try {
        const response = await fetch(API_URL);
        const data = await response.json();
        
        // Clean and prepare data
        allProducts = data.map(item => {
            const rawImageLink = String(item['image link'] || item.imageLink || '').trim();
            const rawThumbnail = String(item.thumbnail || item[''] || rawImageLink).trim();
            const imageLink = normalizeImageUrl(rawImageLink);
            const thumbnail = normalizeImageUrl(rawThumbnail) || imageLink;
            const primaryImage = thumbnail || imageLink || DEFAULT_IMAGE;

            return {
                code: String(item.code || '').trim(),
                fabric: String(item.fabric || 'Pure Silk').trim(),
                price: Number(item.price) || 0,
                qty: Number(item.qty) || 0,
                imageLink: primaryImage,
                thumbnail: primaryImage,
                description: String(item.description || '').trim()
            };
        }).filter(item => item.code);

        const sortProductsByPrice = products => [...products].sort((a, b) => (a.price || 0) - (b.price || 0));
        allProducts = sortProductsByPrice(allProducts);
        filteredProducts = sortProductsByPrice(allProducts);

        elements.spinner.style.display = 'none';
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
        card.onclick = () => showProductDetails(product);

        const imageSrc = product.thumbnail || product.imageLink || DEFAULT_IMAGE;
        const formattedPrice = new Intl.NumberFormat('en-IN').format(product.price);

        const imageWrapper = document.createElement('div');
        imageWrapper.className = 'product-image-wrapper';

        const img = document.createElement('img');
        img.alt = `${product.fabric} Saree`;
        img.loading = 'lazy';
        img.src = imageSrc;
        img.onerror = () => {
            img.onerror = null;
            img.src = DEFAULT_IMAGE;
        };

        imageWrapper.appendChild(img);

        const info = document.createElement('div');
        info.className = 'product-info';
        info.innerHTML = `
            <h3 class="product-title">${product.fabric} Saree</h3>
            <div class="product-price">&#8377;${formattedPrice}</div>
        `;

        card.appendChild(imageWrapper);
        card.appendChild(info);
        container.appendChild(card);
    });
}

// Navigation & Views
function showView(viewName) {
    Object.values(views).forEach(v => v.classList.remove('active'));
    views[viewName].classList.add('active');
    window.scrollTo(0, 0);
    
    // Toggle header elements based on view
    if (viewName === 'details') {
        document.body.classList.add('details-mode');
    } else {
        document.body.classList.remove('details-mode');
    }
}

function showProductDetails(product) {
    currentProduct = product;
    
    const detailImageSrc = product.thumbnail || product.imageLink || DEFAULT_IMAGE;
    elements.detailImage.src = detailImageSrc;
    elements.detailImage.onerror = () => {
        elements.detailImage.onerror = null;
        elements.detailImage.src = DEFAULT_IMAGE;
    };
    
    elements.detailCode.textContent = `Code: ${product.code}`;
    elements.detailTitle.textContent = `${product.fabric} Saree`;
    
    if (product.description) {
        elements.detailDescription.textContent = product.description;
        elements.detailDescription.style.display = 'block';
    } else {
        elements.detailDescription.style.display = 'none';
    }
    
    elements.detailPrice.textContent = new Intl.NumberFormat('en-IN').format(product.price);
    elements.detailFabricHighlight.textContent = product.fabric;
    
    updateWishlistButtonState();
    showView('details');
}

// Calculate and display price ranges for categories
function calculatePriceRanges() {
    const categories = {
        'kanchipuram': 'pure kanchipuram silk',
        'ikkat': 'pure ikkat  silk', // preserving the double space typo in data
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
    
    localStorage.setItem('kalamkariWishlist', JSON.stringify(wishlist));
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
    const searchTerm = elements.searchInput.value.toLowerCase().trim();
    const activeFilterBtn = document.querySelector('.filter-btn.active');
    const filterTerm = activeFilterBtn ? activeFilterBtn.dataset.filter.toLowerCase().trim() : 'all';
    
    filteredProducts = allProducts.filter(product => {
        const matchesSearch = 
            (product.code && product.code.toLowerCase().includes(searchTerm)) ||
            (product.fabric && product.fabric.toLowerCase().includes(searchTerm)) ||
            (product.price && product.price.toString().includes(searchTerm));
            
        // The data has a typo with double spaces 'Pure ikkat  Silk', so doing an includes match or relaxing the check helps
        let matchesFilter = true;
        if (filterTerm !== 'all') {
            const prodFabric = product.fabric ? product.fabric.toLowerCase().replace(/\s+/g, ' ') : '';
            const fTerm = filterTerm.replace(/\s+/g, ' ');
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
    
    elements.searchInput.addEventListener('input', filterAndSearchProducts);
    
    elements.filterBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            elements.filterBtns.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            filterAndSearchProducts();
        });
    });
}

// Boot up
document.addEventListener('DOMContentLoaded', init);
