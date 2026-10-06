import { DRILL_SIZE, OPERATORS, type Operator, type Question, type Rng } from "./types";

const int = (rng: Rng, lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));

export function answerFor(a: number, op: Operator, b: number): number {
  switch (op) {
    case "+": return a + b;
    case "-": return a - b;
    case "*": return a * b;
    case "/": return a / b;
  }
}

const inRange = (n: number) => Number.isInteger(n) && n >= 1 && n <= 100;

export function isValidQuestion(q: Question): boolean {
  if (!OPERATORS.includes(q.operator)) return false;
  if (!inRange(q.num1) || !inRange(q.num2)) return false;
  if (q.operator === "-" && q.num1 < q.num2) return false;
  if (q.operator === "/" && q.num1 % q.num2 !== 0) return false;
  const ans = answerFor(q.num1, q.operator, q.num2);
  return Number.isInteger(ans) && ans === q.expected;
}

function divisorsOf(n: number): number[] {
  const out: number[] = [];
  for (let d = 1; d <= n; d++) if (n % d === 0) out.push(d);
  return out;
}

export function generateQuestion(rng: Rng): Question {
  const operator = OPERATORS[int(rng, 0, 3)];
  let num1: number, num2: number;
  if (operator === "-") { num1 = int(rng, 1, 100); num2 = int(rng, 1, num1); }
  else if (operator === "/") {
    num1 = int(rng, 1, 100);
    const ds = divisorsOf(num1);
    num2 = ds[int(rng, 0, ds.length - 1)];
  } else { num1 = int(rng, 1, 100); num2 = int(rng, 1, 100); }
  return { num1, num2, operator, expected: answerFor(num1, operator, num2) };
}

export function generateDrill(rng: Rng, count = DRILL_SIZE): Question[] {
  return Array.from({ length: count }, () => generateQuestion(rng));
}
