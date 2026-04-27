#!/usr/bin/env python3
import json
import os
from collections import deque
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Lock
from urllib.parse import urlparse

from sense_hat import SenseHat


HOST = os.environ.get("SENSEHAT_HOST", "0.0.0.0")
PORT = int(os.environ.get("SENSEHAT_PORT", "3000"))

sense = SenseHat()
sense.low_light = True

event_queue = deque(maxlen=32)
queue_lock = Lock()


def clamp_channel(value):
    return max(0, min(255, int(value)))


def normalize_color(value):
    if not isinstance(value, list) or len(value) != 3:
        return [255, 255, 255]
    return [clamp_channel(channel) for channel in value]


def normalize_pixels(pixels):
    if not isinstance(pixels, list):
        raise ValueError("pixels must be a list")

    if len(pixels) == 64 and all(isinstance(pixel, list) and len(pixel) == 3 for pixel in pixels):
        return [normalize_color(pixel) for pixel in pixels]

    if len(pixels) == 192 and all(isinstance(channel, (int, float)) for channel in pixels):
        normalized = []
        for index in range(0, 192, 3):
            normalized.append(
                [
                    clamp_channel(pixels[index]),
                    clamp_channel(pixels[index + 1]),
                    clamp_channel(pixels[index + 2]),
                ]
            )
        return normalized

    raise ValueError("pixels must be 64 RGB triplets")


def push_event(event):
    payload = {
        "direction": event.direction,
        "action": event.action,
        "timestamp": getattr(event, "timestamp", None),
    }
    with queue_lock:
        event_queue.append(payload)


def register_joystick_handlers():
    sense.stick.direction_up = push_event
    sense.stick.direction_down = push_event
    sense.stick.direction_left = push_event
    sense.stick.direction_right = push_event
    sense.stick.direction_middle = push_event


class SenseHatHandler(BaseHTTPRequestHandler):
    def _json(self, status_code, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self._json(200, {"ok": True})

    def do_GET(self):
        path = urlparse(self.path).path

        if path == "/health":
            self._json(200, {"ok": True})
            return

        if path == "/joystick":
            with queue_lock:
              event = event_queue.popleft() if event_queue else None
            self._json(200, {"event": event})
            return

        self._json(404, {"error": "Not found"})

    def do_POST(self):
        path = urlparse(self.path).path
        content_length = int(self.headers.get("Content-Length", "0"))
        raw_body = self.rfile.read(content_length) if content_length > 0 else b"{}"

        try:
            payload = json.loads(raw_body.decode("utf-8"))
        except json.JSONDecodeError:
            self._json(400, {"error": "Body must be valid JSON"})
            return

        if path == "/pixels":
            pixels = payload.get("pixels")
            try:
                normalized = normalize_pixels(pixels)
            except ValueError as error:
                length = len(pixels) if isinstance(pixels, list) else None
                self._json(400, {"error": str(error), "received_length": length})
                return

            sense.set_pixels(normalized)
            self._json(200, {"ok": True})
            return

        if path == "/message":
            text = str(payload.get("text", ""))
            colour = normalize_color(payload.get("colour", [100, 200, 255]))
            speed = float(payload.get("speed", 0.05))
            sense.show_message(text, text_colour=colour, scroll_speed=speed)
            self._json(200, {"ok": True})
            return

        self._json(404, {"error": "Not found"})

    def log_message(self, _format, *_args):
        return


def main():
    register_joystick_handlers()
    print(f"Sense HAT server listening on http://{HOST}:{PORT}")
    ThreadingHTTPServer((HOST, PORT), SenseHatHandler).serve_forever()


if __name__ == "__main__":
    main()
