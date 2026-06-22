#!/usr/bin/env python3
"""
PIC18 / RS-485 bus listener + transceiver survival check
========================================================

Scenario
--------
A populated board has a PIC18 that drives an on-board MAX3483 RS-485
transceiver. You CANNOT touch the transceiver's logic pins (DI/RO/DE/RE#) --
they belong to the PIC18. When you apply Vin the PIC18 boots and should start
transmitting on the RS-485 bus.

You're listening from the host with a USB-RS485 adapter wired to the board's
differential A/B bus lines (A->A, B->B, GND->GND). This script:

  1. SCANS common baud rates (the PIC18's rate is unknown) and scores each by
     how "structured" the received data looks (repetition, printable ratio,
     byte diversity).
  2. Picks the best baud and LIVE-MONITORS the bus, printing timestamped,
     frame-grouped hex + ASCII.

What it tells you about the transceiver
---------------------------------------
  * Clean, framed, repeating data appears  -> the board's MAX3483 is DRIVING
    the bus correctly. Its driver (TX path) survived. Good enough for go/no-go.
  * Line is dead silent (and the PIC18 is known to boot) -> the transceiver
    driver may be dead, OR no bus bias / A-B swapped / board not powering up.
  * Bytes arrive but never decode cleanly at ANY baud -> most often A and B are
    swapped (every bit inverted) or there's no fail-safe bias on the bus.

NOTE: passively receiving proves the board's DRIVER works. To also prove its
RECEIVER works you'd need the PIC18 to answer a command you send -- if you know
a query it responds to, run with --probe (see below).

This is a PASSIVE listener by default: it does NOT enable its own driver, so it
won't fight the PIC18 on the half-duplex bus.

----------------------------------------------------------------------------
WIRING (host USB-RS485 adapter  <->  board RS-485 bus)
----------------------------------------------------------------------------
  Adapter A   <--> board A
  Adapter B   <--> board B
  Adapter GND <--> board GND
  (120 ohm termination across A-B at the board end if the run is long.)
  Power the board from Vin as normal. Keep the PIC18 chattering during the scan
  (power-cycle it if it only talks at boot).

----------------------------------------------------------------------------
USAGE
----------------------------------------------------------------------------
  pip install pyserial
  python3 rs485_monitor.py                    # auto port, scan, then monitor
  python3 rs485_monitor.py -p /dev/ttyUSB0    # or COM3
  python3 rs485_monitor.py -b 19200           # skip scan, monitor at 19200
  python3 rs485_monitor.py --scan-seconds 6   # longer dwell per baud
  python3 rs485_monitor.py --probe 3F0D --probe-baud 9600   # test RX path too
"""

import argparse
import sys
import time

try:
    import serial
    from serial.tools import list_ports
except ImportError:
    print("ERROR: pyserial is not installed.  Run:  pip install pyserial",
          file=sys.stderr)
    sys.exit(2)


DEFAULT_BAUDS = [1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200, 230400]


def autodetect_port():
    candidates = []
    for p in list_ports.comports():
        desc = f"{p.description} {p.manufacturer or ''}".lower()
        score = 0
        if any(t in desc for t in ("ftdi", "ft232", "rs485", "rs-485", "ch340",
                                    "cp210", "usb-serial", "usb serial")):
            score += 10
        if any(t in desc for t in ("usb", "uart", "serial")):
            score += 1
        candidates.append((score, p.device))
    if not candidates:
        return None
    candidates.sort(reverse=True)
    return candidates[0][1] if candidates[0][0] > 0 else None


def structure_score(data):
    """Heuristic: how much does this byte stream look like real, correctly-
    framed protocol traffic vs. mis-framed noise? Returns (score, metrics)."""
    n = len(data)
    if n < 16:
        return 0.0, dict(bytes=n, printable=0.0, distinct=0, repeat=0.0,
                         note="too little data")
    printable = sum(1 for b in data if 32 <= b < 127 or b in (9, 10, 13)) / n
    distinct = len(set(data))
    # Best repeating period (PIC status frames are usually periodic).
    best_rep = 0.0
    for period in range(1, min(64, n // 2) + 1):
        matches = sum(1 for i in range(period, n) if data[i] == data[i - period])
        rep = matches / (n - period)
        if rep > best_rep:
            best_rep = rep
    structure = 1.0 - distinct / 256.0
    score = 0.55 * best_rep + 0.25 * printable + 0.20 * structure
    return score, dict(bytes=n, printable=printable, distinct=distinct,
                       repeat=best_rep, note="")


def scan(port, bauds, dwell):
    print(f"Scanning {len(bauds)} baud rates, {dwell:.1f}s each "
          f"(~{len(bauds) * dwell:.0f}s total). Keep the board transmitting...\n")
    print(f"  {'baud':>7}  {'bytes':>6}  {'print%':>6}  {'distinct':>8}  "
          f"{'repeat%':>7}  {'score':>5}")
    print("  " + "-" * 52)
    results = []
    for baud in bauds:
        try:
            with serial.Serial(port, baud, timeout=0.2) as ser:
                ser.reset_input_buffer()
                data = bytearray()
                t_end = time.time() + dwell
                while time.time() < t_end:
                    chunk = ser.read(4096)
                    if chunk:
                        data.extend(chunk)
        except serial.SerialException as e:
            print(f"  {baud:>7}  (port error: {e})")
            continue
        sc, m = structure_score(bytes(data))
        results.append((sc, baud, m))
        print(f"  {baud:>7}  {m['bytes']:>6}  {m['printable']*100:>5.0f}%  "
              f"{m['distinct']:>8}  {m['repeat']*100:>6.0f}%  {sc:>5.2f}"
              + (f"   <- {m['note']}" if m['note'] else ""))
    print()
    results.sort(reverse=True)
    return results


def monitor(port, baud, idle_gap=0.005):
    """Live-print frame-grouped traffic until Ctrl-C. Frames are split on an
    idle gap on the bus (default 5 ms)."""
    print(f"Monitoring {port} @ {baud} baud. Ctrl-C to stop.\n")
    print("  time(s)   bytes  hex / ascii")
    print("  " + "-" * 60)
    t0 = time.time()
    try:
        with serial.Serial(port, baud, timeout=idle_gap) as ser:
            ser.reset_input_buffer()
            frame = bytearray()
            last_rx = None
            while True:
                b = ser.read(1)
                now = time.time()
                if b:
                    if last_rx is not None and (now - last_rx) > idle_gap and frame:
                        _print_frame(now - t0, frame)
                        frame = bytearray()
                    frame.extend(b)
                    last_rx = now
                else:
                    if frame:
                        _print_frame(now - t0, frame)
                        frame = bytearray()
    except KeyboardInterrupt:
        print("\nStopped.")


def _print_frame(ts, frame):
    hexs = frame.hex(" ")
    ascii_ = "".join(chr(b) if 32 <= b < 127 else "." for b in frame)
    # Wrap long frames so the line stays readable.
    print(f"  {ts:7.3f}  {len(frame):>4}   {hexs}")
    print(f"  {'':7}  {'':>4}   |{ascii_}|")


def probe(port, baud, payload, wait=0.5):
    """Send a known query and watch for a reply -- exercises the board's
    RECEIVER path (only meaningful if you know a command the PIC18 answers)."""
    print(f"Probe: sending {payload.hex(' ')} @ {baud} baud, "
          f"listening {wait:.1f}s for a reply...")
    with serial.Serial(port, baud, timeout=wait) as ser:
        ser.reset_input_buffer()
        ser.write(payload)
        ser.flush()
        reply = ser.read(256)
    if reply:
        print(f"  REPLY ({len(reply)} bytes): {reply.hex(' ')}")
        print("  -> The board RECEIVED our query and answered: its MAX3483")
        print("     receiver path works too.")
        return True
    print("  No reply. Either the PIC18 doesn't answer this command, the baud")
    print("  is wrong, or the transceiver's receiver path is not working.")
    return False


def main():
    ap = argparse.ArgumentParser(description="PIC18 RS-485 bus listener / "
                                             "transceiver survival check")
    ap.add_argument("-p", "--port", help="serial port (auto-detected if omitted)")
    ap.add_argument("-b", "--baud", type=int,
                    help="skip the scan and monitor directly at this baud")
    ap.add_argument("--bauds", help="comma-separated baud list to scan "
                                    "(default: common rates)")
    ap.add_argument("--scan-seconds", type=float, default=4.0,
                    help="dwell time per baud during scan (default 4)")
    ap.add_argument("--probe", help="hex bytes to send to test the RX path, "
                                    "e.g. --probe 3F0D")
    ap.add_argument("--probe-baud", type=int, help="baud for --probe "
                                                   "(default: chosen/monitor baud)")
    args = ap.parse_args()

    port = args.port or autodetect_port()
    if not port:
        print("ERROR: no serial port found. Plug in the USB-RS485 adapter or "
              "pass --port.\nList ports:  python3 -m serial.tools.list_ports -v",
              file=sys.stderr)
        sys.exit(2)

    print("=" * 64)
    print(" PIC18 RS-485 bus listener  (passive monitor on A/B)")
    print("=" * 64)
    print(f" Port: {port}")
    print(" Make sure the board is powered from Vin and the PIC18 is talking.")
    print("-" * 64)

    baud = args.baud
    if baud is None:
        bauds = ([int(x) for x in args.bauds.split(",")] if args.bauds
                 else DEFAULT_BAUDS)
        results = scan(port, bauds, args.scan_seconds)
        if not results or results[0][0] <= 0:
            print("VERDICT: NO USABLE DATA on any baud.")
            print("  Nothing structured came back. Check, in order:")
            print("   1. Board actually powered (Vin present) and PIC18 booting.")
            print("   2. A/B not swapped -- try swapping the A and B wires.")
            print("   3. Adapter GND tied to board GND.")
            print("   4. Bus has fail-safe bias (many USB-RS485 dongles include")
            print("      it; if not, add bias + 120 ohm termination).")
            print("  If the PIC18 is confirmed alive and 1-4 are good, the")
            print("  board's MAX3483 driver is suspect -> bench-test it.")
            sys.exit(1)
        best_score, baud, m = results[0]
        print(f"Best match: {baud} baud (score {best_score:.2f}, "
              f"{m['bytes']} bytes, {m['repeat']*100:.0f}% repeating).")
        if best_score < 0.45:
            print("  (Low confidence -- if the live view below looks like junk,")
            print("   try swapping A/B or pass an explicit -b baud.)")
        print()

    if args.probe:
        try:
            payload = bytes.fromhex(args.probe.replace(" ", ""))
        except ValueError:
            print("ERROR: --probe must be hex, e.g. 3F0D", file=sys.stderr)
            sys.exit(2)
        probe(port, args.probe_baud or baud, payload)
        print()

    monitor(port, baud)


if __name__ == "__main__":
    main()
