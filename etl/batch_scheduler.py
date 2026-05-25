import os
import subprocess
import time
from datetime import datetime, timezone


INTERVAL_SECONDS = int(os.getenv("BATCH_INTERVAL_SECONDS", "21600"))
JOBS = [
    ("cosmetic-predictor", ["python", "cosmetic_predictions.py"]),
    ("lol-classifier", ["python", "lol_player_classifier.py"]),
]


def run_job(name, command):
    started = datetime.now(timezone.utc).isoformat()
    print(f"[BatchScheduler] {started} iniciando {name}", flush=True)
    result = subprocess.run(command, check=False)
    finished = datetime.now(timezone.utc).isoformat()
    print(
        f"[BatchScheduler] {finished} {name} termino con codigo {result.returncode}",
        flush=True,
    )


def main():
    run_on_start = os.getenv("BATCH_RUN_ON_START", "true").lower() == "true"
    print(
        f"[BatchScheduler] intervalo={INTERVAL_SECONDS}s run_on_start={run_on_start}",
        flush=True,
    )

    while True:
        if run_on_start:
            for name, command in JOBS:
                run_job(name, command)
        run_on_start = True
        time.sleep(INTERVAL_SECONDS)


if __name__ == "__main__":
    main()
