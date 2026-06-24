const fs = { hora_inicio: '08:00:00', hora_fin: '17:00:00' };

function parseTimeToMinutes(timeStr) {
    if (!timeStr) return 0;
    const parts = timeStr.split(':');
    return (parseInt(parts[0]) * 60) + parseInt(parts[1]);
}

function minutesInHour(intervals, hourStart, hourEnd) {
    let totalMinutes = 0;
    for (const interval of intervals) {
        const start = Math.max(interval.start, hourStart);
        const end = Math.min(interval.end, hourEnd);
        if (start < end) {
            totalMinutes += (end - start) / 60;
        }
    }
    return totalMinutes;
}

const startMinutes = parseTimeToMinutes(fs.hora_inicio);
const endMinutes = parseTimeToMinutes(fs.hora_fin);
const intervals = [{ start: startMinutes, end: endMinutes }];

let horasReales = 0;
console.log('FS: 08:00 - 17:00 (Jornada completa 8-18)');

for (let hour = 8; hour < 18; hour++) {
    const hourStart = hour * 60;
    const hourEnd = (hour + 1) * 60;
    const minutesWorked = minutesInHour(intervals, hourStart, hourEnd);
    horasReales += Math.round(minutesWorked * 100) / 100;
    console.log('Hora ' + hour + ': ' + minutesWorked.toFixed(2) + ' hs');
}
console.log('Total:', horasReales);