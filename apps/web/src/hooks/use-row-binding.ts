import { useEffect, useRef, type RefObject } from 'react';

import { ROW_PROB, ROW_SHIFT } from '../feed/frame-layout.ts';
import { hotStore } from '../feed/hot-store.ts';
import { getBestAsk, getBestBid, getEdge } from '../feed/market-quotes.ts';
import { flash } from '../lib/flash.ts';
import {
  formatPlainPrice,
  formatPrice,
  formatSignedPrice,
  signOfFormatted,
} from '../lib/format.ts';
import { createTextCell, writeTextCell } from '../lib/text-cell.ts';

type CellRef = RefObject<HTMLSpanElement | null>;

export interface RowBinding {
  probRef: CellRef;
  shiftRef: CellRef;
  bidRef: CellRef;
  askRef: CellRef;
  edgeRef: CellRef;
}

const TONES = ['text-bid', 'text-ask', 'text-muted'] as const;

type Tone = (typeof TONES)[number];

function setTone(element: HTMLElement, tone: Tone): void {
  for (const candidate of TONES) {
    element.classList.toggle(candidate, candidate === tone);
  }
}

function toneOfShift(sign: number): Tone {
  if (sign > 0) {
    return 'text-bid';
  }
  return sign < 0 ? 'text-ask' : 'text-muted';
}

export function useRowBinding(market: number): RowBinding {
  const probRef = useRef<HTMLSpanElement>(null);
  const shiftRef = useRef<HTMLSpanElement>(null);
  const bidRef = useRef<HTMLSpanElement>(null);
  const askRef = useRef<HTMLSpanElement>(null);
  const edgeRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const probElement = probRef.current;
    const shiftElement = shiftRef.current;
    const bidElement = bidRef.current;
    const askElement = askRef.current;
    const edgeElement = edgeRef.current;

    if (
      !probElement ||
      !shiftElement ||
      !bidElement ||
      !askElement ||
      !edgeElement
    ) {
      return;
    }

    const prob = createTextCell(probElement);
    const shift = createTextCell(shiftElement);
    const bid = createTextCell(bidElement);
    const ask = createTextCell(askElement);
    const edge = createTextCell(edgeElement);

    const handleRowChange = () => {
      const hadProb = prob.text !== '';
      if (
        writeTextCell(
          prob,
          formatPrice(hotStore.getRowValue(market, ROW_PROB)),
        ) &&
        hadProb
      ) {
        flash(probElement);
      }

      const shiftSign = shift.text === '' ? NaN : signOfFormatted(shift.text);
      if (
        writeTextCell(
          shift,
          formatSignedPrice(hotStore.getRowValue(market, ROW_SHIFT)),
        )
      ) {
        const nextSign = signOfFormatted(shift.text);
        if (nextSign !== shiftSign) {
          setTone(shiftElement, toneOfShift(nextSign));
        }
      }

      writeTextCell(bid, formatPlainPrice(getBestBid(market)));
      writeTextCell(ask, formatPlainPrice(getBestAsk(market)));

      const isEdgePositive =
        edge.text === '' ? null : signOfFormatted(edge.text) > 0;
      if (writeTextCell(edge, formatSignedPrice(getEdge(market)))) {
        const isNextPositive = signOfFormatted(edge.text) > 0;
        if (isNextPositive !== isEdgePositive) {
          setTone(edgeElement, isNextPositive ? 'text-bid' : 'text-muted');
        }
      }
    };

    handleRowChange();

    return hotStore.subscribeRow(market, handleRowChange);
  }, [market]);

  return { probRef, shiftRef, bidRef, askRef, edgeRef };
}
