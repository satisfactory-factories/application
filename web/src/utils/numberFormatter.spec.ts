/* eslint-disable no-loss-of-precision */
import { describe, expect, it } from 'vitest'
import { formatCompact, formatMw, formatNumber, formatNumberFully, snapDriftedInteger, snapNearInteger } from '@/utils/numberFormatter'

describe('numberFormatter', () => {
  describe('formatNumber', () => {
    it('should format a given value into a numbered string', () => {
      expect(formatNumber('10.5')).toBe('10.5')
      expect(formatNumber('123.33')).toBe('123.33')
    })
    it('should format a given high precision value into a numbered string of 3 decimal places', () => {
      expect(formatNumber('10.555555')).toBe('10.556')
      expect(formatNumber('123.333333')).toBe('123.333')
      expect(formatNumber('31.882500000000004')).toBe('31.883')
    })
  })

  describe('formatNumberFully', () => {
    it('should format a given value into a number', () => {
      expect(formatNumberFully('10.5')).toBe(10.5)
      expect(formatNumberFully('123.33')).toBe(123.33)
      expect(formatNumberFully('31.88200000000000000000000001')).toBe(31.882)
      expect(formatNumberFully(79.70625000000001)).toBe(79.706)
      expect(formatNumberFully(31.882500000000004)).toBe(31.883)
      expect(formatNumberFully(21.255000000000003)).toBe(21.255)
      expect(formatNumberFully(21.999999999999999)).toBe(22)
    })

    it('should format and round to .0001 precision', () => {
      expect(formatNumberFully(0.0001, 4)).toBe(0.0001)
      expect(formatNumberFully(1.2224, 4)).toBe(1.2224)
      expect(formatNumberFully(1.22240000000001, 4)).toBe(1.2224)
      expect(formatNumberFully(1.22244999999999, 4)).toBe(1.2224)
      expect(formatNumberFully(1.222450000000001, 4)).toBe(1.2225)
      expect(formatNumberFully(1.99999999999999, 4)).toBe(2)
      expect(formatNumberFully(42.5599875, 3)).toBe(42.56)
    })

    it('should handle a NaN to 0', () => {
      expect(formatNumberFully('NaN')).toBe(0)
    })

    it('should snap near-integer values only when asked to', () => {
      // Snap is opt-in: callers enable it only for whole-number-driven quantities.
      expect(formatNumberFully(120.001, 3, true)).toBe(120)
      expect(formatNumberFully(99.999, 3, true)).toBe(100)
      expect(formatNumberFully(1234.0005, 3, true)).toBe(1234)
      expect(formatNumberFully(1233.999, 3, true)).toBe(1234)
      // Default behaviour keeps deliberate precision (e.g. fractional-clock outputs).
      expect(formatNumberFully(535.9992)).toBe(535.999)
      expect(formatNumberFully(120.001)).toBe(120.001)
    })
  })

  describe('snapNearInteger', () => {
    it('should snap values within 0.002 of a whole number', () => {
      expect(snapNearInteger(120.001)).toBe(120)
      expect(snapNearInteger(120.002)).toBe(120)
      expect(snapNearInteger(99.999)).toBe(100)
      expect(snapNearInteger(99.998)).toBe(100)
      expect(snapNearInteger(-119.999)).toBe(-120)
    })

    it('should leave values outside the tolerance alone', () => {
      expect(snapNearInteger(120.003)).toBe(120.003)
      expect(snapNearInteger(99.997)).toBe(99.997)
      expect(snapNearInteger(822.667)).toBe(822.667)
      expect(snapNearInteger(0.5)).toBe(0.5)
    })

    it('should never snap tiny quantities to zero', () => {
      expect(snapNearInteger(0.001)).toBe(0.001)
      expect(snapNearInteger(-0.001)).toBe(-0.001)
    })
  })

  describe('snapDriftedInteger', () => {
    it('should behave like snapNearInteger for small values', () => {
      expect(snapDriftedInteger(120.001)).toBe(120)
      expect(snapDriftedInteger(120.003)).toBe(120.003)
      expect(snapDriftedInteger(0.001)).toBe(0.001)
    })

    it('should widen with the value, catching drift the flat tolerance misses', () => {
      // #485's drift was 8e-7 of the value, so it outgrew the flat 0.002 past ~2,500/min.
      expect(snapDriftedInteger(2400.002)).toBe(2400)
      expect(snapDriftedInteger(5000.004)).toBe(5000)
      expect(snapDriftedInteger(12000.01)).toBe(12000)
      expect(snapNearInteger(12000.01)).toBe(12000.01) // What the flat tolerance does
    })

    it('should still leave a deliberately chosen quantity alone', () => {
      expect(snapDriftedInteger(12000.5)).toBe(12000.5)
      expect(snapDriftedInteger(12000.05)).toBe(12000.05)
      expect(snapDriftedInteger(822.667)).toBe(822.667)
    })
  })

  describe('formatMw', () => {
    it('should format a value in MW', () => {
      expect(formatMw(100)).toBe('100\u00A0MW')
    })
    it('should stay in MW with thousands separators above 1000', () => {
      expect(formatMw(1000)).toBe('1,000\u00A0MW')
      expect(formatMw(46351)).toBe('46,351\u00A0MW')
    })
    it('should format negative values in MW', () => {
      expect(formatMw(-100)).toBe('-100\u00A0MW')
      expect(formatMw(-1000)).toBe('-1,000\u00A0MW')
    })
  })

  // Four characters under a 36px icon, so precision gives way to fitting.
  describe('formatCompact', () => {
    it('should leave anything under a thousand alone', () => {
      expect(formatCompact(0)).toBe('0')
      expect(formatCompact(45)).toBe('45')
      expect(formatCompact(320)).toBe('320')
      expect(formatCompact(999)).toBe('999')
    })

    it('should keep a decimal only where it says something', () => {
      expect(formatCompact(0.5)).toBe('0.5')
      expect(formatCompact(12.04)).toBe('12')
    })

    it('should abbreviate thousands', () => {
      expect(formatCompact(1000)).toBe('1k')
      expect(formatCompact(1234)).toBe('1.2k')
      expect(formatCompact(10000)).toBe('10k')
      expect(formatCompact(12345)).toBe('12k')
      expect(formatCompact(999999)).toBe('1M')
    })

    it('should abbreviate millions', () => {
      expect(formatCompact(1000000)).toBe('1M')
      expect(formatCompact(2400000)).toBe('2.4M')
      expect(formatCompact(15000000)).toBe('15M')
    })

    // The sign is drawn by the caller, so the magnitude is what has to survive.
    it('should carry a negative through', () => {
      expect(formatCompact(-320)).toBe('-320')
      expect(formatCompact(-1234)).toBe('-1.2k')
    })
  })
})
