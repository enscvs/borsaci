const questionInput = document.getElementById("question");
const analyzeBtn = document.getElementById("analyzeBtn");
const response = document.getElementById("response");
const clock = document.getElementById("clock");

function updateClock() {
  const now = new Date();

  clock.textContent = now.toLocaleTimeString("tr-TR", {
    hour12: false
  });
}

setInterval(updateClock, 1000);
updateClock();

async function analyze() {
  const question = questionInput.value.trim();

  if (!question) {
    questionInput.focus();
    return;
  }

  analyzeBtn.disabled = true;
  analyzeBtn.textContent = "ANALYZING...";

  response.textContent =
    "> PROCESSING REQUEST...\n\n" +
    "> Waiting for AI response...";

  try {
    const res = await fetch("/ask", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        question
      })
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(
        data.error || "Request failed."
      );
    }

    response.textContent =
      "> BORSACI AI RESPONSE\n" +
      "────────────────────────────\n\n" +
      (data.answer || JSON.stringify(data, null, 2));

  } catch (error) {

    response.textContent =
      "> ERROR\n" +
      "────────────────────────────\n\n" +
      error.message;

  } finally {

    analyzeBtn.disabled = false;
    analyzeBtn.textContent = "ANALYZE";

  }
}

analyzeBtn.addEventListener("click", analyze);

questionInput.addEventListener("keydown", (event) => {

  if (
    event.key === "Enter" &&
    !event.shiftKey
  ) {
    event.preventDefault();
    analyze();
  }

  if (event.key === "Escape") {
    questionInput.value = "";
    response.textContent = "Waiting for input...";
  }

});