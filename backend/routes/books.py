from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity, get_jwt
from models import db, Book, Author, ActivityLog, VendorOrder
from datetime import datetime, timezone


@books_bp.route("/", methods=["GET"])
def get_books():
    search = request.args.get("q", "").strip()
    search_type = request.args.get("type", "all")
    query = Book.query.join(Author)
    if search:
        if search_type == "title":
            query = query.filter(Book.title.ilike(f"%{search}%"))
        elif search_type == "author":
            query = query.filter(Author.name.ilike(f"%{search}%"))
        elif search_type == "category":
            query = query.filter(Book.category.ilike(f"%{search}%"))
        else:
            query = query.filter(
                Book.title.ilike(f"%{search}%") |
                Author.name.ilike(f"%{search}%") |
                Book.category.ilike(f"%{search}%")
            )
    books = query.all()
    return jsonify([_serialize(b) for b in books]), 200


@books_bp.route("/<int:book_id>", methods=["GET"])
def get_book(book_id):
    book = Book.query.get_or_404(book_id)
    return jsonify(_serialize(book)), 200


@books_bp.route("/", methods=["POST"])
@jwt_required()
def create_book():
    _require_employee()
    data = request.get_json()
    author = Author.query.get(data["author_id"]) if data.get("author_id") else None
    if not author:
        author = Author(name=data.get("author_name", "Unknown"))
        db.session.add(author)
        db.session.flush()

    book = Book(
        title=data["title"],
        author_id=author.id,
        isbn=data.get("isbn"),
        price=data["price"],
        stock_quantity=data.get("stock_quantity", 0),
        category=data.get("category"),
        description=data.get("description"),
    )
    db.session.add(book)
    db.session.flush()
    db.session.add(ActivityLog(
        user_id=int(get_jwt_identity()),
        action="book_added",
        details=f"Added '{book.title}' by {author.name} (stock: {book.stock_quantity})",
    ))
    db.session.commit()
    return jsonify(_serialize(book)), 201


@books_bp.route("/<int:book_id>", methods=["PUT"])
@jwt_required()
def update_book(book_id):
    _require_employee()
    book = Book.query.get_or_404(book_id)
    data = request.get_json()
    old_stock = book.stock_quantity
    for field in ("title", "price", "stock_quantity", "category", "description", "isbn"):
        if field in data:
            setattr(book, field, data[field])
    if "stock_quantity" in data and data["stock_quantity"] != old_stock:
        db.session.add(ActivityLog(
            user_id=int(get_jwt_identity()),
            action="stock_updated",
            details=f"'{book.title}' stock changed from {old_stock} to {book.stock_quantity}",
        ))
    db.session.commit()
    return jsonify(_serialize(book)), 200


def _require_employee():
    claims = get_jwt()
    if claims.get("role", "customer") not in ("employee", "manager"):
        from flask import abort
        abort(403)


def _serialize(book):
    return {
        "id": book.id,
        "title": book.title,
        "author": book.author.name,
        "isbn": book.isbn,
        "price": book.price,
        "stock_quantity": book.stock_quantity,
        "category": book.category,
        "description": book.description,
    }

@books_bp.route("/<int:book_id>/receive-stock", methods=["POST"])
@jwt_required()
def receive_vendor_stock(book_id):

    employee_check = _require_employee()
    if employee_check:
        return employee_check

    data = request.get_json() or {}
    quantity_received = data.get("quantity_received")

    if not isinstance(quantity_received, int) or quantity_received <= 0:
        return jsonify({
            "error": "quantity_received must be a positive whole number"
        }), 400

    book = Book.query.get(book_id)

    if not book:
        return jsonify({"error": "Book not found"}), 404

    book.stock_quantity += quantity_received
    db.session.commit()

    return jsonify({
        "message": "Vendor stock received successfully",
        "book_id": book.id,
        "title": book.title,
        "quantity_received": quantity_received,
        "new_stock_quantity": book.stock_quantity
    }), 200


@books_bp.route("/vendor-orders", methods=["POST"])
@jwt_required()
def create_vendor_order():
    employee_check = _require_employee()
    if employee_check:
        return employee_check

    data = request.get_json() or {}
    book_id = data.get("book_id")
    quantity_ordered = data.get("quantity_ordered")

    if not isinstance(book_id, int):
        return jsonify({"error": "book_id must be a number"}), 400

    if not isinstance(quantity_ordered, int) or quantity_ordered <= 0:
        return jsonify({"error": "quantity_ordered must be a positive whole number"}), 400

    book = Book.query.get(book_id)

    if not book:
        return jsonify({"error": "Book not found"}), 404

    vendor_order = VendorOrder(
        book_id=book.id,
        quantity_ordered=quantity_ordered,
        status="Pending"
    )

    db.session.add(vendor_order)
    db.session.commit()

    return jsonify({
        "message": "Vendor order created successfully",
        "vendor_order_id": vendor_order.id,
        "book_title": book.title,
        "quantity_ordered": vendor_order.quantity_ordered,
        "status": vendor_order.status
    }), 201


@books_bp.route("/vendor-orders", methods=["GET"])
@jwt_required()
def view_vendor_orders():
    employee_check = _require_employee()
    if employee_check:
        return employee_check

    vendor_orders = VendorOrder.query.all()
    results = []

    for order in vendor_orders:
        results.append({
            "vendor_order_id": order.id,
            "book_id": order.book_id,
            "book_title": order.book.title,
            "quantity_ordered": order.quantity_ordered,
            "quantity_received": order.quantity_received,
            "status": order.status,
            "created_at": order.created_at,
            "received_at": order.received_at
        })

    return jsonify(results), 200


@books_bp.route("/vendor-orders/<int:order_id>/receive", methods=["POST"])
@jwt_required()
def receive_vendor_order(order_id):
    employee_check = _require_employee()
    if employee_check:
        return employee_check

    data = request.get_json() or {}
    quantity_received = data.get("quantity_received")

    if not isinstance(quantity_received, int) or quantity_received <= 0:
        return jsonify({"error": "quantity_received must be a positive whole number"}), 400

    vendor_order = VendorOrder.query.get(order_id)

    if not vendor_order:
        return jsonify({"error": "Vendor order not found"}), 404

    book = Book.query.get(vendor_order.book_id)

    if not book:
        return jsonify({"error": "Book not found"}), 404

    vendor_order.quantity_received += quantity_received
    book.stock_quantity += quantity_received

    if vendor_order.quantity_received >= vendor_order.quantity_ordered:
        vendor_order.status = "Received"
        vendor_order.received_at = datetime.now(timezone.utc)
    else:
        vendor_order.status = "Partially Received"

    db.session.commit()

    return jsonify({
        "message": "Vendor order received and inventory updated",
        "vendor_order_id": vendor_order.id,
        "book_title": book.title,
        "quantity_received": quantity_received,
        "new_stock_quantity": book.stock_quantity,
        "vendor_order_status": vendor_order.status
    }), 200
