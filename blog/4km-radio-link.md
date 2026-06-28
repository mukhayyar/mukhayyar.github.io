# How We Built a 4km Radio Link with a Homemade Antenna

For CanSat Competition 2023, we needed reliable long-range communication between our satellite payload and ground station. Commercial options were expensive. So we built our own.

## The Problem

XBee Pro S3B modules have ~3km range with stock antennas. We needed 4km+ with near-zero packet loss during flight.

## The Solution: Moxon Yagi

We designed a Moxon Yagi antenna optimized for 900MHz band. Key specs:

- **Gain**: ~11 dBi directional
- **Frequency**: 902-928 MHz (ISM band)
- **Materials**: Aluminum rod, PVC pipe, duct tape (yes, really)
- **Cost**: ~$15

## Build Process

1. Calculated element spacing using online Moxon calculator
2. Cut aluminum rods to precise lengths
3. Mounted on PVC boom with cable ties
4. Waterproofed connections with duct tape
5. Connected to XBee via SMA pigtail

## Results

- **4.2km** stable link achieved during field test
- **99% packet reception** rate during actual flight
- **1% data loss** — mostly during rapid tumble after apogee

## Lessons

- Impedance matching matters more than gain
- Duct tape is a valid engineering material
- Test in field conditions, not lab

The antenna cost $15 and outperformed $200 commercial alternatives. Sometimes simpler is better.
