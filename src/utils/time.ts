
export const timeToMs = (time: string) => {
    // 20m, 1h ou 2d
    if(time.endsWith('d')) return parseInt(time) * 24 * 60 * 60 * 1000 //jours en millisecondes
    if(time.endsWith('h')) return parseInt(time) * 60 * 60 * 1000 //heures en millisecondes
    if(time.endsWith('m')) return parseInt(time) * 60 * 1000 //minutes en millisecondes
    if(time.endsWith('s')) return parseInt(time) * 1000 //secondes en millisecondes
    return parseInt(time) //millisecondes

}
/**
 * Convertir le temps sous la forme 15m ,30d, 1h en millisecondes
 * @param {String} time indique la durée de validité du refreshToken
 */
// export function timeToMs(time) {
//     if (time.endsWith('d')) return parseInt(time) * 24 * 60 * 60 * 1000 // jours en millisecondes
//     if (time.endsWith('h')) return parseInt(time) * 60 * 60 * 1000 // heures en millisecondes
//     if (time.endsWith('m')) return parseInt(time) * 60 * 1000 // minutes en millisecondes
//     if(time.endsWith('s')) return parseInt(time) * 1000 //secondes en millisecondes
//     return parseInt(time) * 1000
// }
