export async function postPixels(piUrl, pixels) {
  const response = await fetch(new URL("/pixels", piUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ pixels })
  });

  if (!response.ok) {
    throw new Error(`Failed to send pixels: ${response.status} ${response.statusText}`);
  }
}

export async function showMessage(piUrl, text, colour = [100, 200, 255]) {
  const response = await fetch(new URL("/message", piUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ text, colour })
  });

  if (!response.ok) {
    throw new Error(`Failed to send message: ${response.status} ${response.statusText}`);
  }
}

export async function getJoystickEvent(piUrl) {
  const response = await fetch(new URL("/joystick", piUrl));
  if (!response.ok) {
    throw new Error(`Failed to read joystick event: ${response.status} ${response.statusText}`);
  }
  const payload = await response.json();
  return payload.event ?? null;
}
