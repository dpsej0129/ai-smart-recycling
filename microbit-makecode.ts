// Paste into the JavaScript tab at https://makecode.microbit.org/.
// Change "a", "b", "c" to your exact Teachable Machine class names.
// RESET is reserved for clearing the display.
serial.redirectToUSB()
serial.setBaudRate(BaudRate.BaudRate115200)
serial.onDataReceived(serial.delimiters(Delimiters.NewLine), function () {
    let command = serial.readUntil(serial.delimiters(Delimiters.NewLine))
    if (command == "RESET") {
        basic.clearScreen()
    } else if (command == "a") {
        basic.showLeds(`
            . # # # .
            # . . . #
            # # # # #
            # . . . #
            # . . . #
        `)
    } else if (command == "b") {
        basic.showLeds(`
            # # # # .
            # . . . #
            # # # # .
            # . . . #
            # # # # .
        `)
    } else if (command == "c") {
        basic.showLeds(`
            . # # # #
            # . . . .
            # . . . .
            # . . . .
            . # # # #
        `)
    } else {
        basic.showIcon(IconNames.SmallDiamond)
    }
    serial.writeLine("ACK:" + command)
})
basic.showIcon(IconNames.Yes)
