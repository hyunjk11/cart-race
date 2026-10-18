#!/usr/bin/env bash
# Fast core test subset (also used by CI). Usage: tests/run_core.sh [BASE_URL]   (default http://localhost:8080/)
# Set MP=1 to also run multiplayer tests (public PeerJS broker -> flaky; failures are reported but don't fail the run).
# Each test is retried once before counting as failed.
set -u
cd "$(dirname "$0")"
BASE="${1:-${CART_BASE:-http://localhost:8080/}}"; export CART_BASE="$BASE"
fails=(); mpfails=()
run() { # run <label> <cmd...>
  local label=$1; shift
  for a in 1 2; do
    echo "=== $label (try $a)"; if timeout 420 "$@"; then echo "=== $label OK"; return 0; fi
  done
  echo "=== $label FAILED"; return 1
}
run undef node ../tools/undef.mjs ../js/*.js ../js/config/*.js || fails+=(undef)
run progress node progress.test.mjs || fails+=(progress)
run smoke python3 smoke.py || fails+=(smoke)
run shop1-mart python3 shop1.py "$BASE" mart || fails+=(shop1)
run banner python3 banner.py "$BASE" || fails+=(banner)
run garage python3 garage.py "$BASE" || fails+=(garage)
run account python3 account.py "$BASE" || fails+=(account)
run fit10-subset python3 fit10.py "$BASE" narrow320,s20-land || fails+=(fit10)
if [ "${MP:-0}" = 1 ]; then
  run mp python3 mp.py "$BASE" || mpfails+=(mp)
  run mprejoin python3 mprejoin.py "$BASE" || mpfails+=(mprejoin)
  run garage-mp python3 garage.py "$BASE" --mponly || mpfails+=(garage-mp)
  run mpmigrate python3 mpmigrate.py "$BASE" || mpfails+=(mpmigrate)
fi
echo "CORE: ${#fails[@]} failed ${fails[*]:-}   MP(optional): ${#mpfails[@]} failed ${mpfails[*]:-}"
[ ${#fails[@]} -eq 0 ]
