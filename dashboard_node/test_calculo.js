// Test de cálculo de horas reales
const interval = { start: 480, end: 1020 }; // 08:00 - 17:00

function minutesInHour(intervals, hourStart, hourEnd) {
    let total = 0;
    for (const interval of intervals) {
        const start = Math.max(interval.start, hourStart);
        const end = Math.min(interval.end, hourEnd);
        if (start < end) total += (end - start) / 60;
    }
    return total;
}

let horas = 0;
console.log('Intervalo: 08:00 - 17:00 (480 - 1020 minutos)');
for (let hour = 8; hour < 18; hour++) {
    const hourStart = hour * 60;
    const hourEnd = (hour + 1) * 60;
    const m = minutesInHour([interval], hourStart, hourEnd);
    horas += Math.round(m * 100) / 100;
    console.log('Hora ' + hour + ' (' + hour + ':00-' + (hour+1) + ':00): ' + m.toFixed(2) + ' hs');
}
console.log('Total:', horas, 'horas');