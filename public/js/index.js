


function myFunction() {
  var x = document.getElementById("myDIV");

  if (x.style.display === "none") {
    x.style.display = "block";
  } else {
    x.style.display = "none";
  }
}

    $(document).ready(function () {
      
      var last_valid_selection = null;

      $("#Category").change(function (event) {
        if ($(this).val().length > 5) {
          alert("You can only choose 5!");
          $(this).val(last_valid_selection);
        } else {
          last_valid_selection = $(this).val();
        }
      });
    });




