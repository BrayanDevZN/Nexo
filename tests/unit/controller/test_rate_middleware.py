from fastapi import FastAPI
from starlette.requests import Request

from backend.controller.middleware.rate_limits import route_template


def request(app, path, method="GET"):
    return Request({"type": "http", "app": app, "path": path, "root_path": "", "method": method,
                    "headers": [], "query_string": b"anything=untrusted"})


def test_route_template_uses_parameter_pattern_even_for_wrong_method():
    app = FastAPI()
    app.get("/clients/{identifier}")(lambda identifier: {})
    assert route_template(request(app, "/clients/one")) == "/clients/{identifier}"
    assert route_template(request(app, "/clients/two", "PUT")) == "/clients/{identifier}"
    assert route_template(request(app, "/random-one")) == "unmatched"
    assert route_template(request(app, "/random-two")) == "unmatched"


def test_included_handle_patterns_are_kept_distinct(settings):
    from backend.controller.application import create_app

    app = create_app(settings)
    assert route_template(request(app, "/auth/login", "POST")) == "/auth/login"
    assert route_template(request(app, "/auth/register", "POST")) == "/auth/register"
    assert route_template(request(app, "/clients")) == "/clients"
    assert route_template(request(app, "/clients/one")) == "/clients/{identifier}"
