// Test para Brian Alegre - 3 intervalos
const intervals = [
    { start: 480, end: 600 },   // 08:00 - 10:00
    { start: 600, end: 780 },   // 10:00 - 13:00
    { start: 780, end: 1080 }   // 13:00 - 18:00
];

// Merge intervals
function mergeIntervals(intervals) {
    if (intervals.length === 0) return [];
    intervals.sort((a, b) => a.start - b.start);
    const merged = [intervals[0]];
    for (let i = 1; i < intervals.length; i++) {
        const last = merged[merged.length - 1];
        const current = intervals[i];
        if (current.start < last.end) {
            last.end = Math.max(last.end, current.end);
        } else {
            merged.push(current);
        }
    }
    return merged;
}

function minutesInHour(intervals, hourStart, hourEnd) {
    let total = 0;
    for (const interval of intervals) {
        const start = Math.max(interval.start, hourStart);
        const end = Math.min(interval.end, hourEnd);
        if (start < end) total += (end - start) / 60;
    }
    return total;
}

const merged = mergeIntervals(intervals);
console.log('Merged intervals:', JSON.stringify(merged));

let horas = 0;
for (let hour = 8; hour < 18; hour++) {
    const hourStart = hour * 60;
    const hourEnd = (hour + 1) * 60;
    const m = minutesInHour(merged, hourStart, hourEnd);
    horas += Math.round(m * 100) / 100;
    console.log(`Hora ${hour}: ${m.toFixed(2)} hs`);
}
console.log('Total:', horas);