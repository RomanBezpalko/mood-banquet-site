let csrfTokenPromise;

async function getCsrfToken(forceRefresh = false) {
  if (forceRefresh) csrfTokenPromise = null;

  if (!csrfTokenPromise) {
    csrfTokenPromise = fetch("/api/csrf")
      .then((response) =>
        response.ok
          ? response.json()
          : Promise.reject(new Error("Не вдалося отримати токен безпеки.")),
      )
      .then((body) => body.token);
  }

  return csrfTokenPromise;
}

async function postLead(payload, csrfToken) {
  const response = await fetch("/api/lead", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": csrfToken,
    },
    body: JSON.stringify(payload),
  });

  return {
    response,
    result: await response.json().catch(() => ({})),
  };
}

export async function sendLead(payload) {
  let csrfToken = await getCsrfToken();
  let { response, result } = await postLead(payload, csrfToken);

  if (
    response.status === 403 &&
    result.message === "Недійсний токен безпеки."
  ) {
    csrfToken = await getCsrfToken(true);
    ({ response, result } = await postLead(payload, csrfToken));
  }

  if (!response.ok || !result.ok) {
    throw new Error(
      result.message ||
        "Не вдалося надіслати заявку. Спробуйте ще раз або зателефонуйте до ресторану.",
    );
  }

  return result;
}
