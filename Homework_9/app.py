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

# Simple in-memory TTL cache: { poke_id: (timestamp, payload_dict) }
POKE_CACHE = {}
CACHE_TTL_SECONDS = 600  # 10 minutes
POKEAPI_BASE = "https://pokeapi.co/api/v2/pokemon"


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


@app.route("/api/pokemon/<int:poke_id>")
def get_pokemon_data(poke_id):
    if poke_id < 1 or poke_id > 1025:
        return jsonify({"error": "Invalid Pokédex ID"}), 400

    now = time.time()
    if poke_id in POKE_CACHE:
        cached_time, cached_data = POKE_CACHE[poke_id]
        if now - cached_time < CACHE_TTL_SECONDS:
            return jsonify(cached_data), 200

    try:
        resp = requests.get(f"{POKEAPI_BASE}/{poke_id}", timeout=6)
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

        payload = {
            "id": raw["id"],
            "name": raw["name"],
            "sprite": sprite,
            "types": types,
            "stats": stats,
            "height": raw.get("height", 0),
            "weight": raw.get("weight", 0),
            "base_experience": raw.get("base_experience")
        }

        POKE_CACHE[poke_id] = (now, payload)
        return jsonify(payload), 200

    except requests.RequestException:
        return jsonify({"error": "Unable to reach Pokédex servers."}), 502


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
