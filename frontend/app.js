const API = "";
let token = localStorage.getItem("token") || null;
let userRole = localStorage.getItem("role") || null;

function showSection(id) {
  document.querySelectorAll(".section").forEach(s => s.classList.add("hidden"));
  document.getElementById(id).classList.remove("hidden");
  if (id === "browse") loadBooks();
  if (id === "cart") loadCart();
  if (id === "inventory") loadInventory();
  if (id === "orders") loadAllOrders();
  if (id === "feedback") initFeedbackForm();
  if (id === "staff-feedback") loadStaffFeedback();
}

function applyRoleUI() {
  const isEmployee = userRole === "employee" || userRole === "manager";
  const isCustomer = token && !isEmployee;
  document.getElementById("nav-login").classList.toggle("hidden", !!token);
  document.getElementById("nav-logout").classList.toggle("hidden", !token);
  document.getElementById("nav-feedback").classList.toggle("hidden", !isCustomer);
  document.getElementById("nav-inventory").classList.toggle("hidden", !isEmployee);
  document.getElementById("nav-orders").classList.toggle("hidden", !isEmployee);
  document.getElementById("nav-staff-feedback").classList.toggle("hidden", !isEmployee);
}

function logout() {
  token = null;
  userRole = null;
  localStorage.removeItem("token");
  localStorage.removeItem("role");
  applyRoleUI();
  showSection("browse");
}

// --- Books ---

async function loadBooks(query = "", type = "all") {
  let url = `${API}/books/`;
  if (query) {
    url += `?q=${encodeURIComponent(query)}&type=${type}`;
  }
  
  const res = await fetch(url);
  const books = await res.json();
  const list = document.getElementById("book-list");
  list.innerHTML = books.map(b => `
    <div class="book-card">
      <div>
        <strong>${b.title}</strong> by ${b.author}<br/>
        $${b.price.toFixed(2)} &mdash; ${b.stock_quantity} in stock
      </div>
      <div>
        ${
          b.stock_quantity <= 0
            ? `<span style="color:red;font-weight:bold;">Special Order</span>`
            : b.stock_quantity <= 2
              ? `<span style="color:orange;">Low Stock</span>`
              : `<span style="color:green;">In Stock</span>`
        }
      </div>
      <button
        onclick="addToCart(${b.id})"
        ${b.stock_quantity <= 0 ? "disabled" : ""}
      >
        ${b.stock_quantity <= 0 ? "Unavailable" : "Add to Cart"}
      </button>
    </div>
  `).join("");
}

function searchBooks() {
  const q = document.getElementById("search-input").value;
  const type = document.getElementById("search-type").value;

  loadBooks(q, type);
}

// --- Cart ---

async function loadCart() {
  if (!token) { alert("Please log in first."); showSection("login"); return; }
  const res = await fetch(`${API}/store/cart`, { headers: authHeaders() });
  const cart = await res.json();
  const el = document.getElementById("cart-items");
  el.innerHTML = cart.items.map(i => `
    <div class="cart-item">
      <span>${i.title} x${i.quantity}</span>
      <span>$${i.subtotal.toFixed(2)}
        <button onclick="removeFromCart(${i.cart_item_id})" style="margin-left:8px;background:#e74c3c;color:white;border:none;padding:2px 8px;border-radius:4px;cursor:pointer;">X</button>
      </span>
    </div>
  `).join("") || "<p>Your cart is empty.</p>";
  document.getElementById("cart-total").textContent = cart.total.toFixed(2);
  document.getElementById("cart-count").textContent = cart.items.length;
}

async function addToCart(bookId) {
  if (!token) { alert("Please log in first."); showSection("login"); return; }
  const res = await fetch(`${API}/store/cart`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ book_id: bookId, quantity: 1 }),
  });
  if (res.ok) {
    const cart = await res.json();
    document.getElementById("cart-count").textContent = cart.items.length;
    alert("Added to cart!");
  } else {
    const err = await res.json();
    alert(err.error || "Could not add to cart.");
  }
}

async function removeFromCart(itemId) {
  await fetch(`${API}/store/cart/${itemId}`, { method: "DELETE", headers: authHeaders() });
  loadCart();
}

async function checkout() {
  if (!token) { alert("Please log in first."); return; }
  const res = await fetch(`${API}/store/checkout`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ payment_method: "credit_card" }),
  });
  const data = await res.json();
  if (res.ok) {
    alert(`Order #${data.order_id} placed! Total: $${data.total.toFixed(2)}`);
    loadCart();
  } else {
    alert(data.error || "Checkout failed.");
  }
}

// --- Auth ---

async function login() {
  const email = document.getElementById("login-email").value;
  const password = document.getElementById("login-password").value;
  const res = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (res.ok) {
    token = data.token;
    userRole = data.role;
    localStorage.setItem("token", token);
    localStorage.setItem("role", userRole);
    applyRoleUI();
    showSection("browse");
  } else {
    document.getElementById("login-message").textContent = data.error;
  }
}

function authHeaders() {
  return { Authorization: `Bearer ${token}` };
}

// --- Employee: Inventory ---

function showAddBookForm() {
  document.getElementById("add-book-form").classList.toggle("hidden");
}

async function loadInventory() {
  const res = await fetch(`${API}/books/`);
  const books = await res.json();
  document.getElementById("inventory-list").innerHTML = books.map(b => `
    <div class="book-card">
      <div>
        <strong>${b.title}</strong> by ${b.author}<br/>
        Category: ${b.category || "N/A"} &mdash; ISBN: ${b.isbn || "N/A"}<br/>
        $${b.price.toFixed(2)} &mdash; Stock: ${b.stock_quantity}
      </div>
      <div>
        <label>Update Stock:</label>
        <input type="number" id="stock-${b.id}" value="${b.stock_quantity}" style="width:60px;" />
        <button onclick="updateStock(${b.id})">Save</button>
      </div>
    </div>
  `).join("");
}

async function updateStock(bookId) {
  const qty = parseInt(document.getElementById(`stock-${bookId}`).value);
  await fetch(`${API}/books/${bookId}`, {
    method: "PUT",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ stock_quantity: qty }),
  });
  loadInventory();
}

async function addBook() {
  const body = {
    title: document.getElementById("book-title").value,
    author_name: document.getElementById("book-author").value,
    isbn: document.getElementById("book-isbn").value,
    price: parseFloat(document.getElementById("book-price").value),
    stock_quantity: parseInt(document.getElementById("book-stock").value),
    category: document.getElementById("book-category").value,
    description: document.getElementById("book-description").value,
  };
  const res = await fetch(`${API}/books/`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const msg = document.getElementById("add-book-message");
  if (res.ok) {
    msg.textContent = "Book added successfully.";
    loadInventory();
  } else {
    const err = await res.json();
    msg.textContent = err.error || "Failed to add book.";
  }
}

// --- Employee: Orders ---

async function loadAllOrders() {
  const res = await fetch(`${API}/store/orders`, { headers: authHeaders() });
  const orders = await res.json();
  document.getElementById("orders-list").innerHTML = orders.length ? orders.map(o => `
    <div class="book-card">
      <strong>Order #${o.order_id}</strong> &mdash; Status: ${o.status} &mdash; Total: $${o.total.toFixed(2)}<br/>
      <small>${o.created_at}</small>
      <ul>
        ${o.items.map(i => `<li>${i.title} x${i.quantity} @ $${i.price_at_purchase.toFixed(2)}</li>`).join("")}
      </ul>
    </div>
  `).join("") : "<p>No orders found.</p>";
}

// --- Feedback ---

let selectedRating = 0;

function initFeedbackForm() {
  selectedRating = 0;
  document.getElementById("feedback-message").value = "";
  document.getElementById("feedback-message-status").textContent = "";
  document.getElementById("feedback-category").value = "general";

  const nameField = document.getElementById("feedback-name");
  const emailField = document.getElementById("feedback-email");
  const guestFields = document.getElementById("feedback-guest-fields");

  if (token) {
    guestFields.style.display = "none";
  } else {
    guestFields.style.display = "block";
    nameField.value = "";
    emailField.value = "";
  }

  updateStars(0);

  document.querySelectorAll(".star").forEach(star => {
    star.onmouseover = () => updateStars(parseInt(star.dataset.value));
    star.onmouseout = () => updateStars(selectedRating);
    star.onclick = () => {
      selectedRating = parseInt(star.dataset.value);
      updateStars(selectedRating);
      const labels = ["", "Poor", "Fair", "Good", "Very Good", "Excellent"];
      document.getElementById("rating-label").textContent = labels[selectedRating];
    };
  });
}

function updateStars(value) {
  document.querySelectorAll(".star").forEach(star => {
    star.classList.toggle("active", parseInt(star.dataset.value) <= value);
  });
}

async function submitFeedback() {
  const message = document.getElementById("feedback-message").value.trim();
  const status = document.getElementById("feedback-message-status");

  if (!selectedRating) {
    status.style.color = "#e74c3c";
    status.textContent = "Please select a rating.";
    return;
  }
  if (!message) {
    status.style.color = "#e74c3c";
    status.textContent = "Please enter a message.";
    return;
  }

  const body = {
    rating: selectedRating,
    category: document.getElementById("feedback-category").value,
    message,
  };

  if (!token) {
    body.name = document.getElementById("feedback-name").value.trim();
    body.email = document.getElementById("feedback-email").value.trim();
  }

  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API}/feedback/`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const data = await res.json();

  if (res.ok) {
    status.style.color = "#27ae60";
    status.textContent = data.message || "Thank you for your feedback!";
    selectedRating = 0;
    updateStars(0);
    document.getElementById("rating-label").textContent = "Select a rating";
    document.getElementById("feedback-message").value = "";
    document.getElementById("feedback-category").value = "general";
    if (!token) {
      document.getElementById("feedback-name").value = "";
      document.getElementById("feedback-email").value = "";
    }
  } else {
    status.style.color = "#e74c3c";
    status.textContent = data.error || "Could not submit feedback.";
  }
}

async function loadStaffFeedback() {
  if (!token) return;
  const res = await fetch(`${API}/feedback/`, { headers: authHeaders() });
  if (!res.ok) return;
  const entries = await res.json();

  const listEl = document.getElementById("staff-feedback-list");
  const summaryEl = document.getElementById("feedback-summary");

  if (!entries.length) {
    summaryEl.innerHTML = "";
    listEl.innerHTML = "<p>No feedback submitted yet.</p>";
    return;
  }

  const avg = (entries.reduce((sum, e) => sum + e.rating, 0) / entries.length).toFixed(1);
  summaryEl.innerHTML = `
    <div class="feedback-summary-bar">
      <span class="summary-avg">${avg} <span class="stars-inline">${"&#9733;".repeat(Math.round(avg))}${"&#9734;".repeat(5 - Math.round(avg))}</span></span>
      <span style="color:#555;margin-left:0.8rem;">Average rating &mdash; ${entries.length} review${entries.length !== 1 ? "s" : ""}</span>
    </div>
  `;

  const categoryLabels = { general: "General", selection: "Book Selection", service: "Customer Service", website: "Website Experience", other: "Other" };

  listEl.innerHTML = entries.map(f => `
    <div class="feedback-card">
      <div class="feedback-card-header">
        <div>
          <strong>${escapeHtml(f.name)}</strong>
          ${f.email ? `<span style="color:#888;font-size:0.85rem;margin-left:0.5rem;">${escapeHtml(f.email)}</span>` : ""}
        </div>
        <div style="text-align:right;">
          <span class="feedback-stars">${"&#9733;".repeat(f.rating)}${"&#9734;".repeat(5 - f.rating)}</span>
          <span class="feedback-badge">${categoryLabels[f.category] || f.category}</span>
        </div>
      </div>
      <p class="feedback-card-message">${escapeHtml(f.message)}</p>
      <small style="color:#aaa;">${f.created_at}</small>
    </div>
  `).join("");
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Init
applyRoleUI();
showSection("browse");
