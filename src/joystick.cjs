"use strict";
// Extends sense-hat-joystick-x64, which only emits press events (value === 1),
// to also emit hold (value === 2) and release (value === 0) events.
// This enables reliable short-press vs long-press detection.

const BaseJoystick = require("sense-hat-joystick-x64");

const EV_KEY = 1;
const KEY_MAP = {
  103: "up",
  105: "left",
  106: "right",
  108: "down",
  28: "enter",
};

class Joystick extends BaseJoystick {
  process(msg) {
    const type = msg.readUInt16LE(0);
    const code = msg.readUInt16LE(2);
    const value = msg.readUInt16LE(4);

    if (type !== EV_KEY) return;
    const direction = KEY_MAP[code];
    if (!direction) return;

    if (value === 1) this.emit(direction);                    // press
    if (value === 2) this.emit(`${direction}-hold`);          // auto-repeat while held
    if (value === 0) this.emit(`${direction}-release`);       // release
  }
}

module.exports = Joystick;
