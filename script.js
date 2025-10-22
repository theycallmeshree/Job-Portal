var TxtType = function (el, toRotate, period) {
    this.toRotate = toRotate;
    this.el = el;
    this.loopNum = 0;
    this.period = parseInt(period, 10) || 2000;
    this.txt = '';
    this.tick();
    this.isDeleting = false;
};

TxtType.prototype.tick = function () {
    var i = this.loopNum % this.toRotate.length;
    var fullTxt = this.toRotate[i];

    if (this.isDeleting) {
        this.txt = fullTxt.substring(0, this.txt.length - 1);
    } else {
        this.txt = fullTxt.substring(0, this.txt.length + 1);
    }

    this.el.innerHTML = '<span class="wrap">' + this.txt + '</span>';

    var that = this;
    var delta = 200 - Math.random() * 100;

    if (this.isDeleting) { delta /= 2; }

    if (!this.isDeleting && this.txt === fullTxt) {
        delta = this.period;
        this.isDeleting = true;
    } else if (this.isDeleting && this.txt === '') {
        this.isDeleting = false;
        this.loopNum++;
        delta = 500;
    }

    setTimeout(function () {
        that.tick();
    }, delta);
};

window.onload = function () {
    var elements = document.getElementsByClassName('typewrite');
    for (var i = 0; i < elements.length; i++) {
        var toRotate = elements[i].getAttribute('data-type');
        var period = elements[i].getAttribute('data-period');
        if (toRotate) {
            new TxtType(elements[i], JSON.parse(toRotate), period);
        }
    }
    // Inject CSS
    var css = document.createElement("style");
    css.type = "text/css";
    css.innerHTML = ".typewrite > .wrap { border-right: 0.08em solid #545966}";
    document.body.appendChild(css);
};

$(document).ready(function () {
    $('.department-info-cards').find('div.ai-info').show();
    var source = $('img.ai-info').attr('src').replace('bw', 'color');
    $('img.ai-info').attr('src', source);

    $('.department-info-cards').find('div:not(.ai-info)').hide();

    $('nav.nav-pills a').click(function () {
        var department = $(this).attr('id');
        $('.department-info-cards').find('div:not(.' + department + ')').hide();
        $('.department-info-cards').find('div.' + department).show();
        ($("img[class$='info']") && $("img[class!=department]")).each(function () {
            var source = this.src.replace('color', 'bw');
            this.src = source;
        });
        var source = $('img.' + department).attr('src').replace('bw', 'color');
        $('img.' + department).attr('src', source);
    })

    $('.testimonial-slider').slick({
        centerMode: true,
        dots: true,
        infinite: true,
        slidesToShow: 1,
        slidesToScroll: 1,
        fade: true,
        cssEase: 'linear',
        autoplay: true,
        autoplaySpeed: 4000
    });
});
