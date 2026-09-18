// =========================================
// LIWI-KA ADMIN LOGIN
// =========================================


// Get password input
const passwordInput = document.getElementById("password");

// Get VIEW button
const viewPasswordButton = document.getElementById("viewPassword");


// When VIEW is clicked
viewPasswordButton.addEventListener("click", function () {

    // Show the password
    passwordInput.type = "text";

    // Change button text
    viewPasswordButton.textContent = "HIDE";


    // Automatically hide it after 1 second
    setTimeout(function () {

        passwordInput.type = "password";

        viewPasswordButton.textContent = "VIEW";

    }, 1000);

});