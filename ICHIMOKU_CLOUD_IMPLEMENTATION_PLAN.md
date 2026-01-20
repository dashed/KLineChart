# Ichimoku Cloud Indicator Implementation Plan

## Overview

This document outlines the implementation plan for adding the Ichimoku Cloud (Ichimoku Kinko Hyo) technical indicator to KLineChart. The Ichimoku Cloud is a comprehensive indicator that defines support/resistance, identifies trend direction, gauges momentum, and provides trading signals.

## Technical Background

### Components of Ichimoku Cloud

The Ichimoku Cloud consists of **5 lines** and a **shaded cloud area**:

| Component | Japanese Name | Formula | Displacement |
|-----------|--------------|---------|--------------|
| **Conversion Line** | Tenkan-sen | (9-period High + 9-period Low) / 2 | None |
| **Base Line** | Kijun-sen | (26-period High + 26-period Low) / 2 | None |
| **Leading Span A** | Senkou Span A | (Tenkan-sen + Kijun-sen) / 2 | +26 periods (future) |
| **Leading Span B** | Senkou Span B | (52-period High + 52-period Low) / 2 | +26 periods (future) |
| **Lagging Span** | Chikou Span | Current Close Price | -26 periods (past) |

### Cloud (Kumo) Coloring

- **Bullish Cloud**: When Senkou Span A > Senkou Span B (typically green/lighter)
- **Bearish Cloud**: When Senkou Span A < Senkou Span B (typically red/darker)

### Default Parameters

```
Tenkan Period:  9
Kijun Period:   26
Senkou B Period: 52
Displacement:   26
```

## Codebase Analysis

### Existing Indicator Pattern

Based on the codebase exploration, indicators follow this structure in `/src/extension/indicator/`:

```typescript
interface IndicatorData {
  line1?: number
  line2?: number
  // ...
}

const indicator: IndicatorTemplate<IndicatorData, number> = {
  name: 'INDICATOR_NAME',
  shortName: 'NAME',
  series: 'price' | 'normal' | 'volume',
  calcParams: [param1, param2, ...],
  precision: 2,
  shouldOhlc: boolean,
  figures: [
    { key: 'line1', title: 'Line1: ', type: 'line' },
    // ...
  ],
  calc: (dataList, indicator) => {
    // Return calculated data array
  },
  draw: (params) => {
    // Optional custom drawing (needed for cloud fill)
    return boolean // true = override default, false = add to default
  }
}
```

### Key Files to Reference

| File | Purpose |
|------|---------|
| `src/extension/indicator/bollingerBands.ts` | Multi-line indicator pattern |
| `src/extension/indicator/movingAverageConvergenceDivergence.ts` | Complex styling with conditions |
| `src/extension/indicator/index.ts` | Registration of indicators |
| `src/component/Indicator.ts` | TypeScript interfaces |
| `src/view/IndicatorView.ts` | Rendering logic |
| `src/extension/figure/polygon.ts` | Polygon/fill drawing |

### Custom Drawing Capability

The `draw` callback in `IndicatorDrawParams` provides:
- `ctx`: CanvasRenderingContext2D
- `chart`: Chart instance
- `indicator`: Indicator data and configuration
- `bounding`: Pane boundaries
- `xAxis`: X-axis component (for coordinate conversion)
- `yAxis`: Y-axis component (for coordinate conversion)

## Implementation Plan

### Step 1: Create Data Interface

Create the TypeScript interface for Ichimoku data:

```typescript
// /src/extension/indicator/ichimokuCloud.ts

interface IchimokuCloud {
  tenkan?: number      // Tenkan-sen (Conversion Line)
  kijun?: number       // Kijun-sen (Base Line)
  senkou1?: number     // Senkou Span A (Leading Span A) - displaced forward
  senkou2?: number     // Senkou Span B (Leading Span B) - displaced forward
  chikou?: number      // Chikou Span (Lagging Span) - displaced backward
}
```

### Step 2: Implement Helper Functions

```typescript
/**
 * Calculate the highest high over a period
 */
function getHighest(dataList: KLineData[], endIndex: number, period: number): number

/**
 * Calculate the lowest low over a period
 */
function getLowest(dataList: KLineData[], endIndex: number, period: number): number
```

### Step 3: Implement Calculation Logic

The `calc` function needs to:

1. **Calculate Tenkan-sen** at each point:
   - `(highest_high_9 + lowest_low_9) / 2`

2. **Calculate Kijun-sen** at each point:
   - `(highest_high_26 + lowest_low_26) / 2`

3. **Calculate Senkou Span A** (displaced +26 periods):
   - `(tenkan + kijun) / 2` stored at index + displacement

4. **Calculate Senkou Span B** (displaced +26 periods):
   - `(highest_high_52 + lowest_low_52) / 2` stored at index + displacement

5. **Calculate Chikou Span** (displaced -26 periods):
   - Current close price stored at index - displacement

```typescript
calc: (dataList, indicator) => {
  const params = indicator.calcParams
  const tenkanPeriod = params[0]    // 9
  const kijunPeriod = params[1]     // 26
  const senkouBPeriod = params[2]   // 52
  const displacement = params[3]    // 26

  const result: IchimokuCloud[] = new Array(dataList.length + displacement).fill({})

  dataList.forEach((kLineData, i) => {
    const ichimoku: IchimokuCloud = {}

    // Tenkan-sen (after tenkanPeriod - 1)
    if (i >= tenkanPeriod - 1) {
      ichimoku.tenkan = (getHighest(dataList, i, tenkanPeriod) +
                         getLowest(dataList, i, tenkanPeriod)) / 2
    }

    // Kijun-sen (after kijunPeriod - 1)
    if (i >= kijunPeriod - 1) {
      ichimoku.kijun = (getHighest(dataList, i, kijunPeriod) +
                        getLowest(dataList, i, kijunPeriod)) / 2
    }

    // Senkou Span A (displaced forward)
    if (ichimoku.tenkan !== undefined && ichimoku.kijun !== undefined) {
      const senkouA = (ichimoku.tenkan + ichimoku.kijun) / 2
      result[i + displacement] = { ...result[i + displacement], senkou1: senkouA }
    }

    // Senkou Span B (displaced forward)
    if (i >= senkouBPeriod - 1) {
      const senkouB = (getHighest(dataList, i, senkouBPeriod) +
                       getLowest(dataList, i, senkouBPeriod)) / 2
      result[i + displacement] = { ...result[i + displacement], senkou2: senkouB }
    }

    // Chikou Span (displaced backward)
    if (i >= displacement) {
      result[i - displacement] = { ...result[i - displacement], chikou: kLineData.close }
    }

    result[i] = { ...result[i], ...ichimoku }
  })

  return result
}
```

### Step 4: Define Figures Configuration

```typescript
figures: [
  { key: 'tenkan', title: 'Tenkan: ', type: 'line' },
  { key: 'kijun', title: 'Kijun: ', type: 'line' },
  { key: 'chikou', title: 'Chikou: ', type: 'line' },
  { key: 'senkou1', title: 'Senkou A: ', type: 'line' },
  { key: 'senkou2', title: 'Senkou B: ', type: 'line' }
]
```

### Step 5: Implement Custom Cloud Drawing

The cloud fill requires a custom `draw` function to render the shaded area between Senkou Span A and B with dynamic coloring:

```typescript
draw: ({ ctx, chart, indicator, bounding, xAxis, yAxis }) => {
  const { result } = indicator
  const visibleRange = chart.getChartStore().getVisibleRange()

  // Colors for bullish and bearish clouds
  const bullishColor = 'rgba(46, 189, 133, 0.3)'  // Green with transparency
  const bearishColor = 'rgba(239, 83, 80, 0.3)'  // Red with transparency

  // Group consecutive points by cloud type
  let currentPolygon: { points1: Coordinate[], points2: Coordinate[], isBullish: boolean } | null = null

  for (let i = visibleRange.from; i < visibleRange.to; i++) {
    const data = result[i]
    if (data?.senkou1 !== undefined && data?.senkou2 !== undefined) {
      const x = xAxis.convertToPixel(i)
      const y1 = yAxis.convertToPixel(data.senkou1)
      const y2 = yAxis.convertToPixel(data.senkou2)
      const isBullish = data.senkou1 >= data.senkou2

      if (currentPolygon === null || currentPolygon.isBullish !== isBullish) {
        // Draw previous polygon if exists
        if (currentPolygon !== null) {
          drawCloudPolygon(ctx, currentPolygon, currentPolygon.isBullish ? bullishColor : bearishColor)
        }
        // Start new polygon
        currentPolygon = { points1: [], points2: [], isBullish }
      }

      currentPolygon.points1.push({ x, y: y1 })
      currentPolygon.points2.push({ x, y: y2 })
    }
  }

  // Draw last polygon
  if (currentPolygon !== null) {
    drawCloudPolygon(ctx, currentPolygon, currentPolygon.isBullish ? bullishColor : bearishColor)
  }

  return false // Return false to also draw the default lines
}

function drawCloudPolygon(ctx, polygon, color) {
  const { points1, points2 } = polygon
  if (points1.length < 2) return

  ctx.beginPath()
  ctx.moveTo(points1[0].x, points1[0].y)

  // Draw upper edge (Senkou A)
  for (let i = 1; i < points1.length; i++) {
    ctx.lineTo(points1[i].x, points1[i].y)
  }

  // Draw lower edge in reverse (Senkou B)
  for (let i = points2.length - 1; i >= 0; i--) {
    ctx.lineTo(points2[i].x, points2[i].y)
  }

  ctx.closePath()
  ctx.fillStyle = color
  ctx.fill()
}
```

### Step 6: Register the Indicator

Update `/src/extension/indicator/index.ts`:

```typescript
import ichimokuCloud from './ichimokuCloud'

const extensions = [
  // ... existing indicators
  ichimokuCloud
]
```

### Step 7: Default Styles Configuration

```typescript
const ichimokuCloud: IndicatorTemplate<IchimokuCloud, number> = {
  name: 'ICHIMOKU',
  shortName: 'Ichimoku',
  series: 'price',
  calcParams: [9, 26, 52, 26],  // tenkan, kijun, senkouB, displacement
  precision: 2,
  shouldOhlc: true,
  figures: [/* ... */],

  // Optional: Custom styles per line
  styles: {
    lines: [
      { color: '#2196F3', size: 1 },  // Tenkan - Blue
      { color: '#FF5722', size: 1 },  // Kijun - Red/Orange
      { color: '#9C27B0', size: 1 },  // Chikou - Purple
      { color: '#4CAF50', size: 1 },  // Senkou A - Green
      { color: '#F44336', size: 1 }   // Senkou B - Red
    ]
  }
}
```

## File Structure

```
src/extension/indicator/
├── ichimokuCloud.ts      # New file
├── index.ts              # Update to include ichimokuCloud
└── ... (existing files)
```

## Complete Implementation Checklist

- [ ] Create `/src/extension/indicator/ichimokuCloud.ts`
  - [ ] Define `IchimokuCloud` interface
  - [ ] Implement `getHighest()` helper function
  - [ ] Implement `getLowest()` helper function
  - [ ] Implement `calc()` function with displacement logic
  - [ ] Define `figures` configuration for 5 lines
  - [ ] Implement `draw()` callback for cloud fill
  - [ ] Export the indicator template

- [ ] Update `/src/extension/indicator/index.ts`
  - [ ] Add import for ichimokuCloud
  - [ ] Add to extensions array

- [ ] Testing
  - [ ] Verify all 5 lines render correctly
  - [ ] Verify cloud fill colors correctly based on A/B relationship
  - [ ] Verify displacement works (future projection for cloud)
  - [ ] Test with different parameter values
  - [ ] Test edge cases (insufficient data points)

## Usage Example

Once implemented, users can add the Ichimoku Cloud indicator:

```typescript
import { init } from 'klinecharts'

const chart = init('chart')

// Add with default parameters (9, 26, 52, 26)
chart.createIndicator('ICHIMOKU', false, { id: 'candle_pane' })

// Or with custom parameters
chart.createIndicator('ICHIMOKU', false, {
  id: 'candle_pane',
  calcParams: [7, 22, 44, 22]  // Custom periods
})
```

## Considerations

### Performance Optimization

- Pre-calculate running highs/lows to avoid O(n*period) complexity
- Consider memoization for frequently accessed calculations
- Limit cloud drawing to visible range only

### Edge Cases

1. **Insufficient Data**: Handle cases where dataList length < max period
2. **Future Projection**: Result array needs extra length for displaced Senkou spans
3. **Cloud Transitions**: Handle smooth transitions when cloud color changes

### Compatibility

- Ensure the indicator works on both main price pane and separate sub-panes
- Support zooming and scrolling with the cloud fill
- Tooltip should show all 5 values correctly

## References

- [Ichimoku Cloud - Investopedia](https://www.investopedia.com/terms/i/ichimoku-cloud.asp)
- [Ichimoku Trading Strategy - TradingView](https://www.tradingview.com/ideas/ichimoku/)
- KLineChart existing indicators: `bollingerBands.ts`, `movingAverage.ts`
