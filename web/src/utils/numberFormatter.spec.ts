/* eslint-disable no-loss-of-precision */
import { describe, expect, it } from 'vitest'
import { formatNumber, formatNumberFully, formatPower } from '@/utils/numberFormatter'

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
  })

  describe('formatPower', () => {
    it('should format a given value into a string with a unit of MW', () => {
      expect(formatPower(100).value).toBe('100')
      expect(formatPower(100).unit).toBe('MW')
    })
    it('should format a given value into a string with a unit of GW', () => {
      expect(formatPower(1000).value).toBe('1')
      expect(formatPower(1000).unit).toBe('GW')
    })
    it('should format a given negative value into a string with a unit of MW', () => {
      expect(formatPower(-100).value).toBe('-100')
      expect(formatPower(-100).unit).toBe('MW')
    })
    it('should format a given negative value into a string with a unit of GW', () => {
      expect(formatPower(-1000).value).toBe('-1')
      expect(formatPower(-1000).unit).toBe('GW')
    })
  })
})
