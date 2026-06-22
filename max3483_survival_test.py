#!/usr/bin/env python3
"""
MAX3483 (MAX3483CPA) RS-485 transceiver survival test
=====================================================

Purpose
-------
After a failure on the board's input (e.g. a dead protection diode), you want
to know whether the MAX3483 transceiver itself survived. This script performs a
half-duplex *self-loopback* echo test using a 3.3V USB-to-serial (FTDI) adapter.

Why this works
--------------
The MAX3483 is HALF-DUPLEX: its driver outputs and receiver inputs are the SAME
two pins (A and B). If you enable BOTH the driver (DE high) and the receiver
(RE# low) at the same time, anything you put on DI is driven onto A/B and read
straight back out of RO. So the chip loops itself back -- no partner device,
no second transceiver required.

  FTDI TXD --> DI --> [driver] --> A/B --> [receiver] --> RO --> FTDI RXD

Send bytes, read them back, compare. Clean echo == both halves of the chip work.

!!! 3.3V ONLY !!!
The MAX3483 runs at 3.0-3.6V. Your FTDI adapter MUST be set to 3.3V logic.
Do NOT drive this chip with a 5V FTDI -- that can kill a part that otherwise
survived. Set the adapter's voltage jumper to 3V3 before powering up.

----------------------------------------------------------------------------
WIRING  (MAX3483CPA, 8-pin DIP -- pin 1 is by the notch/dot)
----------------------------------------------------------------------------
  Pin 1  RO   ---------------------------> FTDI RXD   (FTDI receives here)
  Pin 2  RE#  --- GND          (enable receiver: RE# is active-LOW)
  Pin 3  DE   --- 3V3          (enable driver:   DE  is active-HIGH)
  Pin 4  DI   <--------------------------- FTDI TXD   (FTDI transmits here)
  Pin 5  GND  --- common ground (FTDI GND + supply GND tied together)
  Pin 6  A    --- (loopback is internal; nothing required here)
  Pin 7  B    --- (loopback is internal; nothing required here)
  Pin 8  VCC  --- 3V3

Notes:
  * RE# (pin 2) tied to GND and DE (pin 3) tied to 3V3 keeps both driver and
    receiver permanently enabled -- that's what creates the self-loopback.
  * Optional but good practice: a 120 ohm resistor across A-B (pins 6-7) gives
    the driver a realistic load. The test passes with or without it.
  * Make sure the FTDI ground and the board's 3V3 ground are the SAME ground.
  * If you'd rather have the script toggle DE/RE# instead of hard-wiring them,
    wire DE <- FTDI RTS and RE# <- FTDI DTR and run with --drive-enables
    (polarity may be inverted on some adapters; see that option below).

----------------------------------------------------------------------------
USAGE
----------------------------------------------------------------------------
  pip install pyserial
  python3 max3483_survival_test.py                 # auto-detect port
  python3 max3483_survival_test.py -p /dev/ttyUSB0 # or COM3 on Windows
  python3 max3483_survival_test.py -b 19200        # change baud (default 9600)
  python3 max3483_survival_test.py --drive-enables # use RTS/DTR for DE/RE#

The MAX3483 is slew-rate limited to ~250 kbps, so keep baud <= 115200.
9600 is a safe, reliable default for a survival/go-no-go test.
"""

import argparse
import sys
import time


def fail(msg):
    print(f"\nERROR: {msg}", file=sys.stderr)
    sys.exit(2)


try:
    import serial
    from serial.tools import list_ports
except ImportError:
    fail("pyserial is not installed.  Run:  pip install pyserial")


def autodetect_port():
    """Return the most likely FTDI/USB-serial port, or None."""
    candidates = []
    for p in list_ports.comports():
        desc = f"{p.description} {p.manufacturer or ''}".lower()
        score = 0
        if "ftdi" in desc or "ft232" in desc or "future technology" in desc:
            score += 10
        if "usb" in desc or "uart" in desc or "serial" in desc:
            score += 1
        if any(tag in p.device.lower() for tag in ("usb", "tty.", "cu.", "com")):
            score += 1
        candidates.append((score, p.device, p.description))
    if not candidates:
        return None
    candidates.sort(reverse=True)
    return candidates[0][1] if candidates[0][0] > 0 else None


# Test patterns chosen to exercise every bit and catch stuck/shorted lines.
PATTERNS = {
    "all-zeros (0x00)": bytes([0x00] * 8),
    "all-ones  (0xFF)": bytes([0xFF] * 8),
    "alt 0x55": bytes([0x55] * 8),
    "alt 0xAA": bytes([0xAA] * 8),
    "walking-1": bytes([1 << (i % 8) for i in range(8)]),
    "walking-0": bytes([0xFF ^ (1 << (i % 8)) for i in range(8)]),
    "counter": bytes(range(8)),
    "ascii": b"MAX3483?",
}


def run_pattern(ser, name, payload):
    ser.reset_input_buffer()
    ser.reset_output_buffer()
    ser.write(payload)
    ser.flush()
    # Wait long enough for all bytes to round-trip at the configured baud.
    echoed = ser.read(len(payload))
    ok = echoed == payload
    return ok, echoed


def main():
    ap = argparse.ArgumentParser(
        description="MAX3483 RS-485 transceiver self-loopback survival test")
    ap.add_argument("-p", "--port", help="serial port (e.g. /dev/ttyUSB0, COM3). "
                                         "Auto-detected if omitted.")
    ap.add_argument("-b", "--baud", type=int, default=9600,
                    help="baud rate (default 9600; keep <= 115200)")
    ap.add_argument("--drive-enables", action="store_true",
                    help="drive DE from RTS and RE# from DTR instead of hard-wiring")
    ap.add_argument("--invert-enables", action="store_true",
                    help="flip RTS/DTR polarity if --drive-enables reads inverted")
    args = ap.parse_args()

    port = args.port or autodetect_port()
    if not port:
        fail("No serial port found. Plug in the FTDI adapter and/or pass --port. "
             "List ports with:  python3 -m serial.tools.list_ports -v")

    print("=" * 64)
    print(" MAX3483 transceiver survival test (half-duplex self-loopback)")
    print("=" * 64)
    print(f" Port : {port}")
    print(f" Baud : {args.baud}")
    if args.baud > 115200:
        print(" WARNING: baud > 115200 exceeds the MAX3483's ~250 kbps limit;")
        print("          failures at this speed do NOT prove the chip is dead.")
    print(" Reminder: FTDI must be set to 3.3V logic.")
    print("-" * 64)

    try:
        ser = serial.Serial(port, args.baud, timeout=0.5)
    except serial.SerialException as e:
        fail(f"Could not open {port}: {e}\n"
             "On Linux you may need to be in the 'dialout' group:\n"
             "  sudo usermod -aG dialout $USER   (then log out/in)")

    with ser:
        if args.drive_enables:
            # DE  = RTS (active HIGH on the chip)  -> assert to enable driver
            # RE# = DTR (active LOW  on the chip)  -> deassert to enable receiver
            enable = not args.invert_enables
            ser.rts = enable        # drive DE high
            ser.dtr = not enable    # drive RE# low
            print(" DE/RE# driven via RTS/DTR. If every pattern fails, try")
            print(" adding --invert-enables (adapter polarity varies).")
            time.sleep(0.05)

        # Flush any power-on garbage.
        time.sleep(0.1)
        ser.reset_input_buffer()

        results = []
        for name, payload in PATTERNS.items():
            ok, echoed = run_pattern(ser, name, payload)
            results.append((name, ok, payload, echoed))
            status = "PASS" if ok else "FAIL"
            print(f"  [{status}] {name:<18}"
                  f" sent={payload.hex()}  got={echoed.hex() or '(nothing)'}")

    passed = sum(1 for _, ok, _, _ in results if ok)
    total = len(results)
    got_anything = any(echoed for _, _, _, echoed in results)

    print("-" * 64)
    print(f" Result: {passed}/{total} patterns echoed correctly")
    print("=" * 64)

    if passed == total:
        print("""
VERDICT: SURVIVED.
Both the driver and receiver halves of the MAX3483 loop data back cleanly.
The transceiver is functional -- no further testing needed.
""")
        sys.exit(0)

    if not got_anything:
        print("""
VERDICT: NO RESPONSE -- needs testing.
Nothing came back at all. The chip may be dead, OR something upstream is wrong.
Check, in order:
  1. VCC (pin 8) actually at 3.0-3.6V, GND (pin 5) common with FTDI GND.
  2. RE# (pin 2) is LOW and DE (pin 3) is HIGH (receiver + driver enabled).
     If using --drive-enables, also try --invert-enables.
  3. TXD->DI (pin 4) and RO (pin 1)->RXD not swapped.
  4. FTDI confirmed working: jumper TXD directly to RXD (bypassing the chip)
     and re-run -- if THAT fails too, the problem is the adapter, not the MAX3483.
If 1-4 are all good and you still get nothing, the transceiver is bad.
""")
        sys.exit(1)

    print("""
VERDICT: GARBLED / PARTIAL -- needs testing.
Some data came back but it's wrong. This often means a partially-damaged chip,
but rule out the benign causes first:
  * Baud too high for the slew-rate-limited MAX3483 -- retry at 9600.
  * Marginal supply voltage or noisy/floating A-B (try a 120 ohm across A-B).
  * Loose ground between FTDI and the board.
If it still won't pass cleanly at 9600 with a solid ground, treat the
transceiver as suspect and bench-test it.
""")
    sys.exit(1)


if __name__ == "__main__":
    main()
