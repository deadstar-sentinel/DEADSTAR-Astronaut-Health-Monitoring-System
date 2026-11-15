/**
 * Narration for the intro film. Spoken lines avoid exact live numbers (the scenes show those);
 * the light-time line comes in whole-minute variants so the voice always matches the screen.
 */
export const FILM_MINUTES_RANGE: [number, number] = [3, 24];

export function filmLightLine(minutes: number): string {
  const m = Math.max(FILM_MINUTES_RANGE[0], Math.min(FILM_MINUTES_RANGE[1], Math.round(minutes)));
  return `Every word they send home crosses the dark at the speed of light, and still takes about ${m} minutes to arrive. By the time Earth answers, the moment may already be gone.`;
}

export function filmLines(owltMinutes: number): string[] {
  return [
    "Somewhere between Earth and Mars, four people are farther from home than anyone has ever been. When something goes wrong, there is no hospital, and no time to wait. I'm Lifeline. I'm the flight surgeon who stays with them.",
    filmLightLine(owltMinutes),
    "One of the crew is running warm. Temperature, heart rate and heart-rate variability are drifting together, and a fever may be less than a day away. Earth's reply would come too late. So I don't wait. I act, here, on board.",
    "Every crew member lives in me as a digital twin, organ by organ, heartbeat by heartbeat. Each one is linked to NASA's seventeen Human Research Program risks, and forecast hour by hour, honestly, with its uncertainty shown.",
    "I'm built on live NASA and NOAA space weather and JPL orbit data, with physiology calibrated to published NASA findings. The crew you'll meet is simulated, and every forecast I make is graded against its own record.",
    "Four astronauts. One of them needs you, right now. Welcome to mission control.",
  ];
}
