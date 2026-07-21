/* eslint-disable no-loss-of-precision */
import { describe, expect, it } from 'vitest'
import { formatMw, formatNumber, formatNumberFully, snapNearInteger } from '@/utils/numberFormatter'

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

    it('should snap values a rounding-hair away from a whole number to that whole number', () => {
      expect(formatNumberFully(120.001)).toBe(120)
      expect(formatNumberFully(99.999)).toBe(100)
      expect(formatNumberFully(1234.0005)).toBe(1234)
      expect(formatNumberFully(1233.999)).toBe(1234)
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
})
