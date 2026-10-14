export function boxGridSpan(index: number, count: number): string {
    const isLast = index === count - 1;
    const md = count % 2 === 1 && isLast ? "md:col-span-2" : "md:col-span-1";

    const remainder = count % 3;
    const inLastRow = index >= count - remainder;
    const lg =
        remainder === 1 && inLastRow ? "lg:col-span-6" : remainder === 2 && inLastRow ? "lg:col-span-3" : "lg:col-span-2";

    return `${md} ${lg}`;
}
