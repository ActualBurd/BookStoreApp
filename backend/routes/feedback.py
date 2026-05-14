from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity, get_jwt, verify_jwt_in_request
from models import db, Feedback, User

feedback_bp = Blueprint("feedback", __name__)


@feedback_bp.route("/", methods=["POST"])
def submit_feedback():
    data = request.get_json()

    message = (data.get("message") or "").strip()
    if not message:
        return jsonify({"error": "Message is required."}), 400

    rating = data.get("rating")
    if not isinstance(rating, int) or rating < 1 or rating > 5:
        return jsonify({"error": "Rating must be an integer between 1 and 5."}), 400

    user_id = None
    name = (data.get("name") or "").strip() or "Anonymous"
    email = (data.get("email") or "").strip()

    try:
        verify_jwt_in_request(optional=True)
        identity = get_jwt_identity()
        if identity:
            user_id = int(identity)
            user = User.query.get(user_id)
            if user:
                name = user.name
                email = user.email
    except Exception:
        pass

    feedback = Feedback(
        user_id=user_id,
        name=name,
        email=email,
        rating=rating,
        category=data.get("category", "general"),
        message=message,
    )
    db.session.add(feedback)
    db.session.commit()

    return jsonify({"message": "Thank you for your feedback!"}), 201


@feedback_bp.route("/", methods=["GET"])
@jwt_required()
def get_feedback():
    claims = get_jwt()
    role = claims.get("role", "customer")
    if role not in ("employee", "manager"):
        return jsonify({"error": "Access denied."}), 403

    entries = Feedback.query.order_by(Feedback.created_at.desc()).all()
    result = []
    for f in entries:
        result.append({
            "id": f.id,
            "name": f.name or "Anonymous",
            "email": f.email or "",
            "rating": f.rating,
            "category": f.category or "general",
            "message": f.message,
            "created_at": f.created_at.strftime("%Y-%m-%d %H:%M") if f.created_at else "",
        })
    return jsonify(result), 200
