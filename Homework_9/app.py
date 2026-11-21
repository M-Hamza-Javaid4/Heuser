import os
import time
import requests
from flask import Flask, send_from_directory, redirect, jsonify, abort

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
HOME_DIR = os.path.join(BASE_DIR, "home")
GAME_DIR = os.path.join(BASE_DIR, "game")
PORTFOLIO_DIR = os.path.join(BASE_DIR, "portfolio")
API_DIR = os.path.join(BASE_DIR, "api")

app = Flask(__name__, static_folder=None)

# Simple in-memory TTL cache: { query_key: (timestamp, payload_dict) }
API_CACHE = {}
CACHE_TTL = 600  # 10 minutes (600 seconds)
POKEAPI_BASE = "https://pokeapi.co/api/v2/pokemon"
ADVICE_API_URL = "https://api.adviceslip.com/advice"

FALLBACK_WISDOMS = [
    "A true trainer never backs down from an unknown challenge!",
    "Every battle teaches something new, win or lose.",
    "Patience and strategy can overcome raw power every single time.",
    "Treat your Pokémon with trust, and their true strength will awaken.",
    "The journey through the gym circuit begins with a single step."
]


# --- HOME ROUTES ---
@app.route("/")
def home_index():
    return send_from_directory(HOME_DIR, "index.html")


# --- GAME ROUTES (Homework 6) ---
@app.route("/game")
def game_redirect():
    return redirect("/game/", code=302)


@app.route("/game/")
def game_index():
    return send_from_directory(GAME_DIR, "index.html")


@app.route("/game/<path:filename>")
def game_assets(filename):
    return send_from_directory(GAME_DIR, filename)


# --- PORTFOLIO ROUTES (Homework 8) ---
@app.route("/portfolio")
def portfolio_redirect():
    return redirect("/portfolio/", code=302)


@app.route("/portfolio/")
def portfolio_index():
    return send_from_directory(PORTFOLIO_DIR, "index.html")


@app.route("/portfolio/<path:filename>")
def portfolio_assets(filename):
    return send_from_directory(PORTFOLIO_DIR, filename)


# --- LIVE API PAGE & PROXY ROUTES (Homework 9) ---
@app.route("/api")
def api_redirect():
    return redirect("/api/", code=302)


@app.route("/api/")
def api_index():
    return send_from_directory(API_DIR, "index.html")


@app.route("/api/pokemon/<string:query>")
def get_pokemon_data(query):
    clean_query = query.strip().lower()
    if not clean_query:
        return jsonify({"error": "Empty search query provided."}), 400

    # Numeric validation if numeric ID
    if clean_query.isdigit():
        poke_id = int(clean_query)
        if poke_id < 1 or poke_id > 1025:
            return jsonify({"error": "Invalid Pokédex ID. Please choose between 1 and 1025."}), 400

    now = time.time()

    # 1. Check in-memory TTL cache
    if clean_query in API_CACHE:
        cached_time, cached_payload = API_CACHE[clean_query]
        if now - cached_time < CACHE_TTL:
            response_copy = dict(cached_payload)
            response_copy["cached"] = True
            return jsonify(response_copy), 200

    # 2. Fetch primary PokeAPI data
    try:
        resp = requests.get(f"{POKEAPI_BASE}/{clean_query}", timeout=6)
        if resp.status_code == 404:
            return jsonify({"error": f"No Pokémon found matching '{query}'. Check spelling or try an ID from 1-1025!"}), 404
        resp.raise_for_status()
        raw = resp.json()

        sprite = (
            raw.get("sprites", {})
            .get("other", {})
            .get("official-artwork", {})
            .get("front_default")
            or raw.get("sprites", {}).get("front_default")
        )

        types = [t["type"]["name"] for t in raw.get("types", [])]

        target_stats = {"hp", "attack", "defense", "speed"}
        stats = {
            s["stat"]["name"]: s["base_stat"]
            for s in raw.get("stats", [])
            if s["stat"]["name"] in target_stats
        }

        # 3. Fetch Second Free API: Advice Slip API (Trainer Battle Wisdom / Field Motto)
        trainer_wisdom = FALLBACK_WISDOMS[raw["id"] % len(FALLBACK_WISDOMS)]
        try:
            advice_resp = requests.get(ADVICE_API_URL, timeout=3.5)
            if advice_resp.status_code == 200:
                advice_json = advice_resp.json()
                slip = advice_json.get("slip", {}).get("advice")
                if slip:
                    trainer_wisdom = slip
        except Exception:
            # Gracefully keep fallback wisdom so main Pokémon payload never breaks
            pass

        payload = {
            "id": raw["id"],
            "name": raw["name"],
            "sprite": sprite,
            "types": types,
            "stats": stats,
            "height": raw.get("height", 0),
            "weight": raw.get("weight", 0),
            "base_experience": raw.get("base_experience"),
            "wisdom": trainer_wisdom,
            "cached": False
        }

        # Cache eviction guard: Keep within RAM limits
        if len(API_CACHE) > 100:
            oldest_key = min(API_CACHE.keys(), key=lambda k: API_CACHE[k][0])
            API_CACHE.pop(oldest_key, None)

        # Store in cache both under query and resolved ID / Name for maximum cache hits
        API_CACHE[clean_query] = (now, payload)
        API_CACHE[str(raw["id"])] = (now, payload)
        API_CACHE[raw["name"].lower()] = (now, payload)

        return jsonify(payload), 200

    except requests.RequestException:
        return jsonify({"error": "Unable to reach Pokédex servers. Please check your internet connection."}), 502


@app.route("/api/<path:filename>")
def api_assets(filename):
    return send_from_directory(API_DIR, filename)


# --- HOME STATIC ASSETS & 404 FALLBACK ---
@app.route("/<path:filename>")
def home_assets(filename):
    target = os.path.join(HOME_DIR, filename)
    if os.path.isfile(target):
        return send_from_directory(HOME_DIR, filename)
    abort(404)


@app.errorhandler(404)
def page_not_found(error):
    return send_from_directory(BASE_DIR, "404.html"), 404


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)
