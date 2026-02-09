import { Howl } from "howler"

export const sounds = {
  move: new Howl({
    src: ["/assets/sounds/move.mp3"],
    volume: 0.5,
    onloaderror: (id, error) => console.error("Move sound load error:", error),
    onplayerror: (id, error) => console.error("Move sound play error:", error),
  }),

  capture: new Howl({
    src: ["/assets/sounds/capture.mp3"],
    volume: 0.6,
    onloaderror: (id, error) => console.error("Capture sound load error:", error),
  }),

  place: new Howl({
    src: ["/assets/sounds/place.mp3"],
    volume: 0.4,
    onloaderror: (id, error) => console.error("Place sound load error:", error),
  }),

  swap: new Howl({
    src: ["/assets/sounds/swap.mp3"],
    volume: 0.6,
    onloaderror: (id, error) => console.error("Swap sound load error:", error),
  }),

  click: new Howl({
  src: ["/assets/sounds/click.mp3"],
  volume: 0.25,
  onloaderror: (id, error) => console.error("Click sound load error:", error),
  }),

  invalid: new Howl({
    src: ["/assets/sounds/invalid.mp3"],
    volume: 0.35,
    onloaderror: (id, error) =>
      console.error("Invalid sound load error:", error),
  }),

  siegeLock: new Howl({
    src: ["/assets/sounds/siege_lock.mp3"],
    volume: 0.5,
    onloaderror: (id, error) => console.error("SiegeLock sound load error:", error),
  }),

  siegeBreak: new Howl({
    src: ["/assets/sounds/siege_break.mp3"],
    volume: 0.5,
    onloaderror: (id, error) => console.error("SiegeBreak sound load error:", error),
  }),

  gameOver: new Howl({
    src: ["/assets/sounds/gameover.mp3"],
    volume: 0.7,
    onloaderror: (id, error) => console.error("GameOver sound load error:", error),
  }),
}
